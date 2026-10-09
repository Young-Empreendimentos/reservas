-- Sistema "Reservas": histórico de alterações (só admins veem), e-mail aos admins a cada
-- nova reserva e status público dos lotes para o Lotfinder.
--
-- O e-mail sai pelo Apps Script "Sistema de reservas" (action 'notificar_reserva').
-- O endereço e o token NÃO ficam aqui: são lidos do Vault do Supabase, com os nomes
--   reservas_apps_script_url   e   reservas_apps_script_token
-- (inseridos à parte pelo SQL Editor com vault.create_secret).

-- ── Histórico ────────────────────────────────────────────────────────────────
create table marketing.reservas_historico (
  id bigint generated always as identity primary key,
  reserva_id bigint not null references marketing.reservas(id) on delete cascade,
  lote text,
  acao text not null check (acao in ('criada', 'editada', 'cancelada', 'reativada', 'anexos')),
  alteracoes jsonb,
  feito_por uuid,
  feito_por_email text,
  feito_em timestamptz not null default now()
);
create index reservas_historico_reserva_idx on marketing.reservas_historico (reserva_id, feito_em desc);

alter table marketing.reservas_historico enable row level security;
create policy historico_admin_ver on marketing.reservas_historico for select to authenticated
  using (marketing.reservas_admin());
grant select on marketing.reservas_historico to authenticated;
grant all on marketing.reservas_historico to service_role;

-- Campos que identificam a reserva não mudam numa edição (lote muda só cancelando e reservando outro).
create or replace function marketing.reservas_proteger_campos() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.lote := old.lote;
  new.criado_em := old.criado_em;
  new.criado_por := old.criado_por;
  new.criado_por_email := old.criado_por_email;
  return new;
end $$;

create trigger reservas_proteger_campos before update on marketing.reservas
  for each row execute function marketing.reservas_proteger_campos();

-- Registra quem criou, editou, cancelou, reativou ou anexou, com o "de → para" de cada campo.
create or replace function marketing.reservas_registrar_historico() returns trigger
language plpgsql security definer set search_path = marketing, public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_acao text;
  v_quem text := coalesce(nullif(marketing.reservas_email_atual(), ''), 'sistema');
  k text;
begin
  if tg_op = 'INSERT' then
    insert into marketing.reservas_historico (reserva_id, lote, acao, feito_por, feito_por_email)
    values (new.id, new.lote, 'criada', auth.uid(), v_quem);
    return new;
  end if;

  v_old := to_jsonb(old) - 'atualizado_em';
  v_new := to_jsonb(new) - 'atualizado_em';
  for k in select jsonb_object_keys(v_new) loop
    if (v_new -> k) is distinct from (v_old -> k) then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('de', v_old -> k, 'para', v_new -> k));
    end if;
  end loop;
  if v_diff = '{}'::jsonb then
    return new;
  end if;

  v_acao := case
    when v_diff ? 'situacao' and new.situacao = 'Cancelada' then 'cancelada'
    when v_diff ? 'situacao' and old.situacao = 'Cancelada' then 'reativada'
    when not exists (
      select 1 from jsonb_object_keys(v_diff) c
      where c not in ('pasta_anexos', 'documento_titular', 'documento_segundo_comprador',
                      'comprovante_residencia', 'comprovante_pagamento', 'ficha_assinada')
    ) then 'anexos'
    else 'editada'
  end;

  insert into marketing.reservas_historico (reserva_id, lote, acao, alteracoes, feito_por, feito_por_email)
  values (new.id, new.lote, v_acao, v_diff, auth.uid(), v_quem);
  return new;
end $$;

create trigger reservas_historico after insert or update on marketing.reservas
  for each row execute function marketing.reservas_registrar_historico();

-- ── E-mail aos admins a cada nova reserva ───────────────────────────────────
-- Falha no envio nunca impede a reserva (só gera um aviso no log do banco).
create or replace function marketing.reservas_notificar_admins() returns trigger
language plpgsql security definer set search_path = marketing, public as $$
declare
  v_url text;
  v_token text;
  v_admins text[];
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'reservas_apps_script_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'reservas_apps_script_token';
  select array_agg(email order by email) into v_admins
    from marketing.reservas_usuarios where papel = 'admin' and status = 'aprovado';
  if v_url is null or v_token is null or v_admins is null then
    raise warning 'reservas_notificar_admins: Vault ou admins não configurados';
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'action', 'notificar_reserva',
      'token', v_token,
      'para', v_admins,
      'reserva', jsonb_build_object(
        'id', new.id,
        'lote', new.lote,
        'nome', new.nome,
        'intermediacao', new.intermediacao,
        'responsavel', new.responsavel_reserva,
        'forma_pagamento', new.forma_pagamento,
        'criado_por', new.criado_por_email,
        'criado_em', to_char(new.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      )
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'reservas_notificar_admins: %', sqlerrm;
  return new;
end $$;

create trigger reservas_notificar_admins after insert on marketing.reservas
  for each row execute function marketing.reservas_notificar_admins();

-- ── Status público dos lotes (Lotfinder) ────────────────────────────────────
-- Só número e status; nenhum dado de cliente. Liberado para o papel anon.
create or replace function marketing.lotfinder_status() returns table (numero text, status text)
language sql stable security definer set search_path = marketing, public as $$
  select l.numero, l.status from marketing.reservas_lotes l
$$;

revoke all on function marketing.lotfinder_status() from public;
grant execute on function marketing.lotfinder_status() to anon, authenticated;

-- As funções de gatilho não são chamáveis pela API.
revoke all on function marketing.reservas_registrar_historico() from public, anon, authenticated;
revoke all on function marketing.reservas_notificar_admins() from public, anon, authenticated;
revoke all on function marketing.reservas_proteger_campos() from public, anon, authenticated;

-- ── Responsável vinculado à conta (preenche a reserva automaticamente) ──────
-- Definido pelo admin na aba Usuários; vazio = o app tenta casar pelo nome da conta Google.
alter table marketing.reservas_usuarios add column responsavel text;
