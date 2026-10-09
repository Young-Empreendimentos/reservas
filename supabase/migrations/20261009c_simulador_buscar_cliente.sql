-- Simulador de Vendas: preencher os dados do comprador pelo CPF na hora de gerar o contrato.
-- Fonte: reservas/pré-vendas (vw_reservas_clientes; titular ou 2º comprador) e, se não houver,
-- o cadastro de clientes do Sienge. Só usuários ativos do Simulador (comercial.simulador_usuarios)
-- conseguem chamar; a checagem é feita no servidor pelo usuário logado.

-- A view passa a trazer o tipo (Reserva / Pré-venda). Colunas novas só podem entrar no fim.
create or replace view marketing.vw_reservas_clientes as
select r.id, r.criado_em, r.criado_por, r.criado_por_email, r.lote, r.empreendimento, r.intermediacao,
       r.responsavel_reserva, r.nome, r.escolaridade, r.nacionalidade, r.sexo, r.estado_civil, r.data_casamento,
       r.regime_bens, r.profissao, r.data_nascimento, r.cpf, r.rg_cnh, r.orgao_expedidor, r.data_expedicao,
       r.endereco, r.cidade, r.email, r.telefone, r.nome_secundario, r.nacionalidade_secundario, r.sexo_secundario,
       r.data_nascimento_secundario, r.cpf_secundario, r.rg_cnh_secundario, r.orgao_expedidor_secundario,
       r.data_expedicao_secundario, r.empresa_secundario, r.profissao_secundario, r.endereco_secundario,
       r.email_secundario, r.telefone_secundario, r.tipo_residencia, r.tempo_residencia, r.renda_familiar,
       r.filhos, r.interesses, r.forma_pagamento, r.motivo_compra, r.quantidade_terrenos, r.recomendacao,
       r.origem, r.observacoes, r.imovel_objeto, r.valor_arras, r.valor_arras_texto, r.preco_condicoes,
       r.valor_corretagem_beneficiario, r.pasta_anexos, r.documento_titular, r.documento_segundo_comprador,
       r.comprovante_residencia, r.comprovante_pagamento, r.ficha_assinada, r.situacao, r.atualizado_em,
       s.id as sienge_cliente_id, s.name as sienge_nome, s.email as sienge_email, s.phone_number as sienge_telefone,
       r.tipo
from marketing.reservas r
left join sienge.sienge_clientes s on s.cpf = regexp_replace(r.cpf, '\D', '', 'g');

revoke all on marketing.vw_reservas_clientes from anon, authenticated;
grant select on marketing.vw_reservas_clientes to service_role;

create or replace function marketing.simulador_buscar_cliente(p_cpf text) returns jsonb
language plpgsql stable security definer set search_path = marketing, public as $$
declare
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from comercial.simulador_usuarios u
    where u.ativo and u.status = 'ativo'
      and (u.user_id = auth.uid() or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  ) then
    raise exception 'Sem permissão para consultar clientes.';
  end if;
  if length(v_cpf) <> 11 then
    return null;
  end if;

  -- 1) Titular de reserva/pré-venda (a mais recente, ativas primeiro)
  select jsonb_build_object(
           'origem', 'reserva', 'lote', lote, 'tipo', tipo,
           'nome', nome, 'nacionalidade', nacionalidade, 'data_nascimento', data_nascimento,
           'estado_civil', estado_civil, 'regime_bens', regime_bens, 'profissao', profissao,
           'documento', rg_cnh, 'orgao_expedidor', orgao_expedidor, 'data_expedicao', data_expedicao,
           'email', email, 'telefone', telefone, 'endereco', endereco, 'cidade', cidade)
    into v
    from marketing.vw_reservas_clientes
   where regexp_replace(cpf, '\D', '', 'g') = v_cpf
   order by (situacao = 'Cancelada'), criado_em desc
   limit 1;
  if v is not null then return v; end if;

  -- 2) Segundo comprador de alguma reserva/pré-venda
  select jsonb_build_object(
           'origem', 'reserva', 'lote', lote, 'tipo', tipo,
           'nome', nome_secundario, 'nacionalidade', nacionalidade_secundario,
           'data_nascimento', data_nascimento_secundario, 'profissao', profissao_secundario,
           'documento', rg_cnh_secundario, 'orgao_expedidor', orgao_expedidor_secundario,
           'data_expedicao', data_expedicao_secundario, 'email', email_secundario,
           'telefone', telefone_secundario, 'endereco', endereco_secundario)
    into v
    from marketing.vw_reservas_clientes
   where regexp_replace(coalesce(cpf_secundario, ''), '\D', '', 'g') = v_cpf
   order by (situacao = 'Cancelada'), criado_em desc
   limit 1;
  if v is not null then return v; end if;

  -- 3) Cliente da Young no Sienge (sem reserva)
  select jsonb_build_object(
           'origem', 'sienge',
           'nome', name, 'nacionalidade', nationality, 'data_nascimento', birth_date,
           'estado_civil', civil_status, 'regime_bens', matrimonial_regime, 'profissao', profession,
           'documento', coalesce(nullif(number_identity_card, ''), license_number),
           'documento_tipo', case when coalesce(number_identity_card, '') = '' and coalesce(license_number, '') <> '' then 'CNH' else 'RG' end,
           'orgao_expedidor', coalesce(nullif(issuing_body, ''), license_issuing_body),
           'data_expedicao', coalesce(issue_date_identity_card, license_issue_date),
           'email', email, 'telefone', phone_number,
           'endereco', concat_ws(', ', nullif(street_name, ''), nullif(address_number, '')),
           'bairro', neighborhood, 'cidade_nome', city, 'uf', state, 'cep', zip_code)
    into v
    from sienge.sienge_clientes
   where cpf = v_cpf
   limit 1;
  return v;
end $$;

revoke all on function marketing.simulador_buscar_cliente(text) from public, anon;
grant execute on function marketing.simulador_buscar_cliente(text) to authenticated;

notify pgrst, 'reload schema';
