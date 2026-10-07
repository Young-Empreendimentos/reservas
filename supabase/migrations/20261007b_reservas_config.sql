-- Configurações sensíveis do sistema Reservas (ex.: qualificação do Outorgante no arras).
-- Os VALORES não ficam no repositório: são inseridos direto no banco pelo SQL Editor.
-- Só usuários aprovados leem; só admins alteram.

create table marketing.reservas_config (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

alter table marketing.reservas_config enable row level security;
create policy config_ver on marketing.reservas_config for select to authenticated
  using (marketing.reservas_aprovado());
create policy config_admin_altera on marketing.reservas_config for update to authenticated
  using (marketing.reservas_admin()) with check (marketing.reservas_admin());
grant select, update on marketing.reservas_config to authenticated;
grant all on marketing.reservas_config to service_role;

-- insert into marketing.reservas_config (chave, valor) values ('outorgante', '<texto do Campo 1 do arras>');
