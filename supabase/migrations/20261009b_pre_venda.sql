-- Pré-venda para investidores (15/10 a 14/11) e reservas do público (a partir de 01/11).
-- A ficha passa a ter o tipo: 'Reserva' (arras fixo de R$ 2.000) ou 'Pré-venda' (valor de entrada informado).
-- O lote é travado do mesmo jeito nos dois casos: um lote em pré-venda não pode ser reservado.

alter table marketing.reservas
  add column tipo text not null default 'Reserva' check (tipo in ('Reserva', 'Pré-venda'));

-- Data a partir da qual o tipo 'Reserva' é aceito (admins podem antes, para testes).
insert into marketing.reservas_config (chave, valor) values ('inicio_reservas', '2026-11-01')
on conflict (chave) do nothing;

create or replace function marketing.reservar_lote(p_lote text, p_dados jsonb) returns bigint
language plpgsql security definer set search_path = marketing, public as $$
declare
  v_status text;
  v_id bigint;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_tipo text := coalesce(nullif(d ->> 'tipo', ''), 'Reserva');
  v_valor numeric;
  v_inicio date;
begin
  if not marketing.reservas_aprovado() then
    raise exception 'Seu acesso ainda não foi liberado.';
  end if;
  if coalesce(trim(d ->> 'nome'), '') = '' or coalesce(trim(d ->> 'cpf'), '') = '' then
    raise exception 'Nome e CPF do comprador são obrigatórios.';
  end if;
  if v_tipo not in ('Reserva', 'Pré-venda') then
    raise exception 'Tipo inválido: escolha Reserva ou Pré-venda.';
  end if;

  if v_tipo = 'Pré-venda' then
    v_valor := nullif(regexp_replace(coalesce(d ->> 'valorEntrada', ''), '[^0-9.]', '', 'g'), '')::numeric;
    if v_valor is null or v_valor <= 0 then
      raise exception 'Informe o valor da entrada da pré-venda.';
    end if;
  else
    select nullif(valor, '')::date into v_inicio from marketing.reservas_config where chave = 'inicio_reservas';
    if v_inicio is not null and (now() at time zone 'America/Sao_Paulo')::date < v_inicio
       and not marketing.reservas_admin() then
      raise exception 'As reservas abrem em %. Até lá, só pré-venda.', to_char(v_inicio, 'DD/MM/YYYY');
    end if;
    v_valor := 2000;
  end if;

  select status into v_status from marketing.reservas_lotes where numero = p_lote for update;
  if v_status is null then
    raise exception 'Lote % não encontrado.', p_lote;
  end if;
  if v_status <> 'disponivel' then
    raise exception 'O lote % não está disponível.', p_lote;
  end if;

  insert into marketing.reservas (
    criado_por, criado_por_email, lote, tipo, valor_arras,
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
    auth.uid(), marketing.reservas_email_atual(), p_lote, v_tipo, v_valor,
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

-- E-mail aos admins: passa a dizer se é reserva ou pré-venda (e o valor).
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
        'tipo', new.tipo,
        'valor', new.valor_arras,
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

revoke all on function marketing.reservas_notificar_admins() from public, anon, authenticated;

notify pgrst, 'reload schema';
