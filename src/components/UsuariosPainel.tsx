'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/src/lib/auth';
import { db, mensagemErro, type Perfil } from '@/src/lib/supabase';
import { RESPONSAVEIS_PARCEIROS, RESPONSAVEIS_YOUNG, vinculoDoUsuario } from '@/src/lib/responsaveis';

const ROTULO_STATUS: Record<Perfil['status'], string> = {
  pendente: 'Aguardando',
  aprovado: 'Liberado',
  recusado: 'Recusado',
};

export default function UsuariosPainel() {
  const { perfil } = useAuth();
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data, error } = await db
      .from('reservas_usuarios')
      .select('*')
      .order('status', { ascending: false })
      .order('criado_em', { ascending: false });
    if (error) setErro(mensagemErro(error));
    else setUsuarios((data || []) as Perfil[]);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function alterar(u: Perfil, mudanca: Partial<Perfil>) {
    const { error } = await db
      .from('reservas_usuarios')
      .update({ ...mudanca, decidido_por: perfil?.email, decidido_em: new Date().toISOString() })
      .eq('id', u.id);
    if (error) alert(mensagemErro(error));
    await carregar();
  }

  // Vínculo com o responsável: preenche intermediação e responsável nas reservas dessa conta.
  async function vincular(u: Perfil, responsavel: string) {
    const { error } = await db.from('reservas_usuarios').update({ responsavel: responsavel || null }).eq('id', u.id);
    if (error) alert(mensagemErro(error));
    await carregar();
  }

  const pendentes = usuarios.filter(u => u.status === 'pendente');

  return (
    <main className="map-page">
      <section className="map-shell painel">
        <div className="map-toolbar">
          <div>
            <div className="toolbar-title">Usuários</div>
            <div className="toolbar-subtitle">
              {pendentes.length
                ? `${pendentes.length} pedido(s) de acesso aguardando liberação.`
                : 'Nenhum pedido de acesso pendente.'}
            </div>
          </div>
        </div>

        {erro && <div className="form-error">{erro}</div>}

        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Situação</th><th>Papel</th><th>Responsável nas reservas</th><th>Pedido em</th><th>Decidido por</th><th /></tr>
            </thead>
            <tbody>
              {usuarios.map(u => {
                const euMesmo = u.email === perfil?.email;
                return (
                  <tr key={u.id} className={u.status === 'pendente' ? 'destaque' : ''}>
                    <td>{u.nome || '—'}</td>
                    <td>{u.email}</td>
                    <td>{ROTULO_STATUS[u.status]}</td>
                    <td>
                      <select
                        value={u.papel}
                        disabled={euMesmo}
                        onChange={e => alterar(u, { papel: e.target.value as Perfil['papel'] })}
                      >
                        <option value="usuario">Usuário</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <select value={u.responsavel || ''} onChange={e => vincular(u, e.target.value)}>
                        <option value="">
                          {(() => {
                            const auto = vinculoDoUsuario({ ...u, responsavel: null }).responsavel;
                            return auto ? `Automático (${auto})` : 'Automático (nenhum)';
                          })()}
                        </option>
                        <optgroup label="Young">
                          {RESPONSAVEIS_YOUNG.map(r => <option key={r}>{r}</option>)}
                        </optgroup>
                        <optgroup label="Corretor parceiro / Imobiliária">
                          {RESPONSAVEIS_PARCEIROS.map(r => <option key={r}>{r}</option>)}
                        </optgroup>
                      </select>
                    </td>
                    <td>{new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
                    <td>{u.decidido_por || '—'}</td>
                    <td className="acoes-linha">
                      {!euMesmo && u.status !== 'aprovado' && (
                        <button className="mini ok" onClick={() => alterar(u, { status: 'aprovado' })}>Liberar</button>
                      )}
                      {!euMesmo && u.status !== 'recusado' && (
                        <button className="mini" onClick={() => alterar(u, { status: 'recusado' })}>
                          {u.status === 'aprovado' ? 'Bloquear' : 'Recusar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
