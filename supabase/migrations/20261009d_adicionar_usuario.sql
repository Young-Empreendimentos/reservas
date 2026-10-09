-- Aba Usuários: admin cadastra um usuário à mão (e-mail + nome), já liberado.
-- Se o e-mail já existir, atualiza nome/papel/responsável e libera.
create or replace function marketing.reservas_adicionar_usuario(
  p_email text, p_nome text, p_papel text default 'usuario', p_responsavel text default null
) returns marketing.reservas_usuarios
language plpgsql security definer set search_path = marketing, public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v marketing.reservas_usuarios;
begin
  if not marketing.reservas_admin() then
    raise exception 'Só admins podem adicionar usuários.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if coalesce(p_papel, 'usuario') not in ('admin', 'usuario') then
    raise exception 'Papel inválido.';
  end if;

  insert into marketing.reservas_usuarios (email, nome, papel, status, responsavel, decidido_por, decidido_em)
  values (v_email, nullif(trim(p_nome), ''), coalesce(p_papel, 'usuario'), 'aprovado',
          nullif(trim(p_responsavel), ''), marketing.reservas_email_atual(), now())
  on conflict (email) do update
    set nome = coalesce(excluded.nome, marketing.reservas_usuarios.nome),
        papel = excluded.papel,
        status = 'aprovado',
        responsavel = coalesce(excluded.responsavel, marketing.reservas_usuarios.responsavel),
        decidido_por = excluded.decidido_por,
        decidido_em = excluded.decidido_em
  returning * into v;
  return v;
end $$;

revoke all on function marketing.reservas_adicionar_usuario(text, text, text, text) from public, anon;
grant execute on function marketing.reservas_adicionar_usuario(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
