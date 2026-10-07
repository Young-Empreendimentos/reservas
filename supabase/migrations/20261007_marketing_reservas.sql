-- Sistema "Reservas" (Erico Verissimo - Fase 2) — schema marketing
-- Tabelas: reservas_usuarios, reservas_lotes, reservas; view vw_reservas_clientes.
-- Escrita de reservas só pela função marketing.reservar_lote (trava o lote na transação).

create schema if not exists marketing;
grant usage on schema marketing to anon, authenticated, service_role;

-- ── Usuários (login Google de qualquer conta; admin aprova) ──────────────────
create table marketing.reservas_usuarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique check (email = lower(email)),
  nome text,
  papel text not null default 'usuario' check (papel in ('admin', 'usuario')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado_em timestamptz not null default now(),
  decidido_por text,
  decidido_em timestamptz
);

insert into marketing.reservas_usuarios (email, nome, papel, status, decidido_por, decidido_em) values
  ('matheus@youngempreendimentos.com.br', 'Matheus Fraga', 'admin', 'aprovado', 'configuracao inicial', now()),
  ('caroline@youngempreendimentos.com.br', 'Caroline Bortoluzzi', 'admin', 'aprovado', 'configuracao inicial', now()),
  ('helen@youngempreendimentos.com.br', 'Helen Cardoso', 'admin', 'aprovado', 'configuracao inicial', now()),
  ('eduardo@youngempreendimentos.com.br', 'Eduardo Tebaldi', 'admin', 'aprovado', 'configuracao inicial', now());

create or replace function marketing.reservas_email_atual() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function marketing.reservas_aprovado() returns boolean
language sql stable security definer set search_path = marketing, public as $$
  select exists (select 1 from marketing.reservas_usuarios u
                 where u.email = marketing.reservas_email_atual() and u.status = 'aprovado')
$$;

create or replace function marketing.reservas_admin() returns boolean
language sql stable security definer set search_path = marketing, public as $$
  select exists (select 1 from marketing.reservas_usuarios u
                 where u.email = marketing.reservas_email_atual() and u.status = 'aprovado' and u.papel = 'admin')
$$;

-- Chamada depois do login: cria a solicitação (pendente) e devolve o perfil.
create or replace function marketing.reservas_meu_perfil() returns marketing.reservas_usuarios
language plpgsql security definer set search_path = marketing, public as $$
declare
  v_email text := marketing.reservas_email_atual();
  v marketing.reservas_usuarios;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Login obrigatório.';
  end if;
  insert into marketing.reservas_usuarios (user_id, email, nome)
  values (auth.uid(), v_email, coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'))
  on conflict (email) do update
    set user_id = coalesce(marketing.reservas_usuarios.user_id, excluded.user_id),
        nome = coalesce(marketing.reservas_usuarios.nome, excluded.nome)
  returning * into v;
  return v;
end $$;

alter table marketing.reservas_usuarios enable row level security;
create policy usuarios_ver on marketing.reservas_usuarios for select to authenticated
  using (email = marketing.reservas_email_atual() or marketing.reservas_admin());
create policy usuarios_admin_altera on marketing.reservas_usuarios for update to authenticated
  using (marketing.reservas_admin()) with check (marketing.reservas_admin());
grant select, update on marketing.reservas_usuarios to authenticated;
grant all on marketing.reservas_usuarios to service_role;

-- ── Lotes (preço entra depois) ────────────────────────────────────────────────
create table marketing.reservas_lotes (
  numero text primary key,
  empreendimento text not null default 'Erico Verissimo - Fase 2',
  area numeric(10, 2),
  matricula integer,
  preco numeric(12, 2),
  status text not null default 'disponivel' check (status in ('disponivel', 'reservado', 'bloqueado')),
  atualizado_em timestamptz not null default now()
);

alter table marketing.reservas_lotes enable row level security;
create policy lotes_ver on marketing.reservas_lotes for select to authenticated
  using (marketing.reservas_aprovado());
create policy lotes_admin_altera on marketing.reservas_lotes for update to authenticated
  using (marketing.reservas_admin()) with check (marketing.reservas_admin());
grant select, update on marketing.reservas_lotes to authenticated;
grant all on marketing.reservas_lotes to service_role;

-- Lotes da Fase 2 (área e matrícula de comercial.comercial_lotes_detalhes):
-- 60 disponíveis (sem mata nativa: 99–155 e 165–167), demais bloqueados. Preço entra depois.
insert into marketing.reservas_lotes (numero, area, matricula, status)
select d.num_lote, d.area::numeric, d.matricula,
       case when d.num_lote::int between 99 and 155 or d.num_lote::int between 165 and 167
            then 'disponivel' else 'bloqueado' end
  from comercial.comercial_lotes_detalhes d
 where d.empreendimento = 'Erico Verissimo'
   and d.num_lote ~ '^\d+$'
   and (d.num_lote::int between 99 and 183 or d.num_lote::int between 494 and 524
        or d.num_lote::int between 529 and 564 or d.num_lote::int between 569 and 598
        or d.num_lote::int between 602 and 615 or d.num_lote::int between 630 and 632
        or d.num_lote::int between 762 and 775 or d.num_lote::int = 783);

-- ── Reservas (todas as informações da ficha + arras + anexos no Drive) ────────
create table marketing.reservas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  criado_por_email text,
  lote text not null references marketing.reservas_lotes(numero),
  empreendimento text not null default 'Erico Verissimo - Fase 2',

  intermediacao text,
  responsavel_reserva text,

  nome text not null,
  escolaridade text,
  nacionalidade text,
  sexo text,
  estado_civil text,
  data_casamento date,
  regime_bens text,
  profissao text,
  data_nascimento date,
  cpf text not null,
  rg_cnh text,
  orgao_expedidor text,
  data_expedicao date,
  endereco text,
  cidade text,
  email text,
  telefone text,

  nome_secundario text,
  nacionalidade_secundario text,
  sexo_secundario text,
  data_nascimento_secundario date,
  cpf_secundario text,
  rg_cnh_secundario text,
  orgao_expedidor_secundario text,
  data_expedicao_secundario date,
  empresa_secundario text,
  profissao_secundario text,
  endereco_secundario text,
  email_secundario text,
  telefone_secundario text,

  tipo_residencia text,
  tempo_residencia text,
  renda_familiar text,
  filhos text,
  interesses text[],
  forma_pagamento text,
  motivo_compra text,
  quantidade_terrenos text,
  recomendacao text,
  origem text,
  observacoes text,

  imovel_objeto text,
  valor_arras numeric(12, 2) not null default 2000,
  valor_arras_texto text,
  preco_condicoes text,
  valor_corretagem_beneficiario text,

  pasta_anexos text,
  documento_titular text,
  documento_segundo_comprador text,
  comprovante_residencia text,
  comprovante_pagamento text,
  ficha_assinada text,

  situacao text not null default 'Pendente',
  atualizado_em timestamptz not null default now()
);

create index reservas_cpf_idx on marketing.reservas (regexp_replace(cpf, '\D', '', 'g'));
create index reservas_criado_por_idx on marketing.reservas (criado_por);
-- Um lote só pode ter uma reserva ativa.
create unique index reservas_lote_ativa_uidx on marketing.reservas (lote) where situacao <> 'Cancelada';

alter table marketing.reservas enable row level security;
create policy reservas_ver on marketing.reservas for select to authenticated
  using ((criado_por = auth.uid() and marketing.reservas_aprovado()) or marketing.reservas_admin());
create policy reservas_admin_altera on marketing.reservas for update to authenticated
  using (marketing.reservas_admin()) with check (marketing.reservas_admin());
grant select, update on marketing.reservas to authenticated;
grant all on marketing.reservas to service_role;

-- Reserva atômica: trava o lote, confere disponibilidade, grava a ficha e marca o lote.
create or replace function marketing.reservar_lote(p_lote text, p_dados jsonb) returns bigint
language plpgsql security definer set search_path = marketing, public as $$
declare
  v_status text;
  v_id bigint;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  if not marketing.reservas_aprovado() then
    raise exception 'Seu acesso ainda não foi liberado.';
  end if;
  if coalesce(trim(d ->> 'nome'), '') = '' or coalesce(trim(d ->> 'cpf'), '') = '' then
    raise exception 'Nome e CPF do comprador são obrigatórios.';
  end if;

  select status into v_status from marketing.reservas_lotes where numero = p_lote for update;
  if v_status is null then
    raise exception 'Lote % não encontrado.', p_lote;
  end if;
  if v_status <> 'disponivel' then
    raise exception 'O lote % não está disponível.', p_lote;
  end if;

  insert into marketing.reservas (
    criado_por, criado_por_email, lote,
    intermediacao, responsavel_reserva,
    nome, escolaridade, nacionalidade, sexo, estado_civil, data_casamento, regime_bens, profissao,
    data_nascimento, cpf, rg_cnh, orgao_expedidor, data_expedicao, endereco, cidade, email, telefone,
    nome_secundario, nacionalidade_secundario, sexo_secundario, data_nascimento_secundario, cpf_secundario,
    rg_cnh_secundario, orgao_expedidor_secundario, data_expedicao_secundario, empresa_secundario,
    profissao_secundario, endereco_secundario, email_secundario, telefone_secundario,
    tipo_residencia, tempo_residencia, renda_familiar, filhos, interesses, forma_pagamento, motivo_compra,
    quantidade_terrenos, recomendacao, origem, observacoes,
    imovel_objeto, valor_arras_texto, preco_condicoes, valor_corretagem_beneficiario
  ) values (
    auth.uid(), marketing.reservas_email_atual(), p_lote,
    nullif(d ->> 'intermediacao', ''), nullif(d ->> 'responsavelReserva', ''),
    trim(d ->> 'nome'), nullif(d ->> 'escolaridade', ''), nullif(d ->> 'nacionalidade', ''), nullif(d ->> 'sexo', ''),
    nullif(d ->> 'estadoCivil', ''), nullif(d ->> 'dataCasamento', '')::date, nullif(d ->> 'regimeBens', ''),
    nullif(d ->> 'profissao', ''), nullif(d ->> 'dataNascimento', '')::date, trim(d ->> 'cpf'),
    nullif(d ->> 'rgCnh', ''), nullif(d ->> 'orgaoExpedidor', ''), nullif(d ->> 'dataExpedicao', '')::date,
    nullif(d ->> 'endereco', ''), nullif(d ->> 'cidade', ''), nullif(d ->> 'email', ''), nullif(d ->> 'telefone', ''),
    nullif(d ->> 'nomeSecundario', ''), nullif(d ->> 'nacionalidadeSecundario', ''), nullif(d ->> 'sexoSecundario', ''),
    nullif(d ->> 'dataNascimentoSecundario', '')::date, nullif(d ->> 'cpfSecundario', ''),
    nullif(d ->> 'rgCnhSecundario', ''), nullif(d ->> 'orgaoExpedidorSecundario', ''),
    nullif(d ->> 'dataExpedicaoSecundario', '')::date, nullif(d ->> 'empresaSecundario', ''),
    nullif(d ->> 'profissaoSecundario', ''), nullif(d ->> 'enderecoSecundario', ''),
    nullif(d ->> 'emailSecundario', ''), nullif(d ->> 'telefoneSecundario', ''),
    nullif(d ->> 'tipoResidencia', ''), nullif(d ->> 'tempoResidencia', ''), nullif(d ->> 'rendaFamiliar', ''),
    nullif(d ->> 'filhos', ''),
    case when jsonb_typeof(d -> 'interesses') = 'array'
         then array(select jsonb_array_elements_text(d -> 'interesses')) end,
    nullif(d ->> 'formaPagamento', ''), nullif(d ->> 'motivoCompra', ''), nullif(d ->> 'quantidadeTerrenos', ''),
    nullif(d ->> 'recomendacao', ''), nullif(d ->> 'origem', ''), nullif(d ->> 'observacoes', ''),
    nullif(d ->> 'imovelObjeto', ''), nullif(d ->> 'valorArras', ''), nullif(d ->> 'precoCondicoes', ''),
    nullif(d ->> 'valorCorretagemBeneficiario', '')
  ) returning id into v_id;

  update marketing.reservas_lotes set status = 'reservado', atualizado_em = now() where numero = p_lote;
  return v_id;
end $$;

-- Preenchimento por CPF: última reserva com esse CPF + cadastro do Sienge.
create or replace function marketing.reservas_buscar_cliente(p_cpf text) returns jsonb
language plpgsql stable security definer set search_path = marketing, public as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_res jsonb;
  v_sienge jsonb;
begin
  if not marketing.reservas_aprovado() then
    raise exception 'Seu acesso ainda não foi liberado.';
  end if;
  if length(v_cpf) <> 11 then
    return null;
  end if;

  select to_jsonb(r) - 'id' - 'criado_em' - 'criado_por' - 'criado_por_email' - 'lote' - 'situacao'
         - 'pasta_anexos' - 'documento_titular' - 'documento_segundo_comprador' - 'comprovante_residencia'
         - 'comprovante_pagamento' - 'ficha_assinada' - 'imovel_objeto' - 'preco_condicoes'
         - 'valor_corretagem_beneficiario' - 'atualizado_em'
    into v_res
    from marketing.reservas r
   where regexp_replace(r.cpf, '\D', '', 'g') = v_cpf
   order by r.criado_em desc limit 1;

  select jsonb_build_object(
           'nome', s.name, 'email', s.email, 'sexo', s.sex, 'nacionalidade', s.nationality,
           'estado_civil', s.civil_status, 'regime_bens', s.matrimonial_regime, 'profissao', s.profession,
           'data_nascimento', s.birth_date, 'rg_cnh', s.number_identity_card, 'orgao_expedidor', s.issuing_body,
           'data_expedicao', s.issue_date_identity_card, 'telefone', s.phone_number,
           'endereco', concat_ws(', ', s.street_name, s.address_number, s.neighborhood),
           'cidade', concat_ws('/', s.city, s.state))
    into v_sienge
    from sienge.sienge_clientes s
   where s.cpf = v_cpf
   limit 1;

  if v_res is null and v_sienge is null then
    return null;
  end if;
  return jsonb_build_object('reserva', v_res, 'sienge', v_sienge);
end $$;

revoke all on function marketing.reservar_lote(text, jsonb) from public, anon;
revoke all on function marketing.reservas_buscar_cliente(text) from public, anon;
revoke all on function marketing.reservas_meu_perfil() from public, anon;
grant execute on function marketing.reservar_lote(text, jsonb) to authenticated;
grant execute on function marketing.reservas_buscar_cliente(text) to authenticated;
grant execute on function marketing.reservas_meu_perfil() to authenticated;
grant execute on function marketing.reservas_aprovado(), marketing.reservas_admin(), marketing.reservas_email_atual()
  to authenticated, service_role;

-- ── View para o Simulador de Vendas: reserva + cadastro do Sienge pelo CPF ────
create view marketing.vw_reservas_clientes as
select r.*,
       s.id as sienge_cliente_id,
       s.name as sienge_nome,
       s.email as sienge_email,
       s.phone_number as sienge_telefone
  from marketing.reservas r
  left join sienge.sienge_clientes s on s.cpf = regexp_replace(r.cpf, '\D', '', 'g');

revoke all on marketing.vw_reservas_clientes from public, anon, authenticated;
grant select on marketing.vw_reservas_clientes to service_role;
