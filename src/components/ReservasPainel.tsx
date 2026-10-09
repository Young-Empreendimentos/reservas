'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Dashboard from './Dashboard';
import { useAuth } from '@/src/lib/auth';
import { db, FUNCAO_ANEXOS, mensagemErro, supabase, type Reserva } from '@/src/lib/supabase';

// Sem etapa de aprovação: a reserva nasce ativa (lote já fica reservado) e só admin cancela.
const SITUACOES = ['Ativa', 'Cancelada'];
const situacaoDe = (r: Reserva) => (r.situacao === 'Cancelada' ? 'Cancelada' : 'Ativa');

// Todas as colunas da reserva (exportação CSV e detalhe).
const COLUNAS: [string, string][] = [
  ['id', 'Nº'], ['criado_em', 'Data'], ['lote', 'Lote'], ['situacao', 'Situação'],
  ['intermediacao', 'Intermediação'], ['responsavel_reserva', 'Responsável'], ['criado_por_email', 'Criado por'],
  ['nome', 'Nome'], ['cpf', 'CPF'], ['email', 'E-mail'], ['telefone', 'Telefone'],
  ['escolaridade', 'Escolaridade'], ['nacionalidade', 'Nacionalidade'], ['sexo', 'Sexo'],
  ['estado_civil', 'Estado civil'], ['data_casamento', 'Data do casamento'], ['regime_bens', 'Regime de bens'],
  ['profissao', 'Profissão'], ['data_nascimento', 'Nascimento'], ['rg_cnh', 'RG/CNH'],
  ['orgao_expedidor', 'Órgão expedidor'], ['data_expedicao', 'Data de expedição'], ['endereco', 'Endereço'],
  ['cidade', 'Cidade'],
  ['nome_secundario', '2º comprador'], ['cpf_secundario', 'CPF 2º'], ['nacionalidade_secundario', 'Nacionalidade 2º'],
  ['sexo_secundario', 'Sexo 2º'], ['data_nascimento_secundario', 'Nascimento 2º'], ['rg_cnh_secundario', 'RG/CNH 2º'],
  ['orgao_expedidor_secundario', 'Órgão 2º'], ['data_expedicao_secundario', 'Expedição 2º'],
  ['empresa_secundario', 'Empresa 2º'], ['profissao_secundario', 'Profissão 2º'],
  ['endereco_secundario', 'Endereço 2º'], ['email_secundario', 'E-mail 2º'], ['telefone_secundario', 'Telefone 2º'],
  ['tipo_residencia', 'Tipo de residência'], ['tempo_residencia', 'Tempo na residência'],
  ['renda_familiar', 'Renda familiar'], ['filhos', 'Filhos'], ['interesses', 'Interesses'],
  ['forma_pagamento', 'Forma de pagamento'], ['motivo_compra', 'Motivo'], ['quantidade_terrenos', 'Qtd. terrenos'],
  ['recomendacao', 'Recomendação'], ['origem', 'Como soube'], ['observacoes', 'Observações'],
  ['imovel_objeto', 'Imóvel objeto'], ['valor_arras_texto', 'Valor do arras'], ['preco_condicoes', 'Preço e condições'],
  ['valor_corretagem_beneficiario', 'Corretagem e beneficiário'],
  ['pasta_anexos', 'Pasta de anexos'], ['documento_titular', 'Documento titular'],
  ['documento_segundo_comprador', 'Documento 2º comprador'], ['comprovante_residencia', 'Comprovante de residência'],
  ['comprovante_pagamento', 'Comprovante de pagamento'],
];

// Colunas que aparecem por padrão (o usuário pode escolher outras no botão "Colunas").
const PADRAO: [string, string][] = [
  ['criado_em', 'Data'], ['lote', 'Lote'], ['nome', 'Comprador'], ['cpf', 'CPF'], ['telefone', 'Telefone'],
  ['responsavel_reserva', 'Responsável'], ['intermediacao', 'Intermediação'], ['situacao', 'Situação'], ['criado_por_email', 'Criado por'],
];

function texto(r: Reserva, col: string): string {
  const v = r[col];
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (col === 'situacao') return v === 'Cancelada' ? 'Cancelada' : 'Ativa';
  if (col === 'criado_em') return new Date(String(v)).toLocaleString('pt-BR');
  if (/^data_/.test(col)) {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
  }
  return String(v);
}

// Campos que o admin pode editar no detalhe (lote, situação, autor e anexos têm fluxo próprio).
const NAO_EDITAVEIS = new Set([
  'id', 'criado_em', 'lote', 'situacao', 'criado_por_email',
  'pasta_anexos', 'documento_titular', 'documento_segundo_comprador', 'comprovante_residencia', 'comprovante_pagamento',
]);
const LONGOS = new Set(['observacoes', 'imovel_objeto', 'valor_arras_texto', 'preco_condicoes', 'valor_corretagem_beneficiario']);
const ROTULO = Object.fromEntries(COLUNAS);
const ACOES: Record<string, string> = {
  criada: 'Reserva criada', editada: 'Dados editados', cancelada: 'Reserva cancelada',
  reativada: 'Reserva reativada', anexos: 'Anexos enviados',
};

type Historico = {
  id: number;
  acao: string;
  alteracoes: Record<string, { de: unknown; para: unknown }> | null;
  feito_por_email: string | null;
  feito_em: string;
};

const valorHist = (v: unknown) =>
  v === null || v === undefined || v === '' ? '(vazio)' : Array.isArray(v) ? v.join(', ') : String(v);

// Valor do campo como texto de formulário (datas em AAAA-MM-DD, listas separadas por vírgula).
function paraCampo(r: Reserva, c: string): string {
  const v = r[c];
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return /^data_/.test(c) ? String(v).slice(0, 10) : String(v);
}

function baixar(nome: string, conteudo: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReservasPainel() {
  const { admin, perfil } = useAuth();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [fSituacao, setFSituacao] = useState('');
  const [fResponsavel, setFResponsavel] = useState('');
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean }>({ col: 'criado_em', asc: false });
  const [detalhe, setDetalhe] = useState<Reserva | null>(null);
  const [visao, setVisao] = useState<'dashboard' | 'tabela'>('dashboard');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [lotes, setLotes] = useState<{ disponivel: number; reservado: number; bloqueado: number }>({ disponivel: 0, reservado: 0, bloqueado: 0 });

  useEffect(() => {
    try {
      const v = localStorage.getItem('reservas.visao');
      if (v === 'tabela' || v === 'dashboard') setVisao(v);
    } catch { /* ok */ }
  }, []);

  function trocarVisao(v: 'dashboard' | 'tabela') {
    setVisao(v);
    try { localStorage.setItem('reservas.visao', v); } catch { /* ok */ }
  }
  const [visiveis, setVisiveis] = useState<string[]>(() => PADRAO.map(([c]) => c));
  const [escolhendo, setEscolhendo] = useState(false);

  // Colunas escolhidas ficam salvas neste navegador.
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem('reservas.colunas') || 'null');
      if (Array.isArray(salvo) && salvo.length) setVisiveis(salvo);
    } catch { /* sem armazenamento local */ }
  }, []);

  function mudarColunas(cols: string[]) {
    setVisiveis(cols);
    try { localStorage.setItem('reservas.colunas', JSON.stringify(cols)); } catch { /* ok */ }
  }

  const VISIVEIS = COLUNAS.filter(([c]) => visiveis.includes(c) && (admin || c !== 'criado_por_email'));

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await db.from('reservas').select('*').order('criado_em', { ascending: false });
    if (error) setErro(mensagemErro(error));
    else {
      setReservas((data || []) as Reserva[]);
      setErro('');
    }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    db.from('reservas_lotes').select('status').then(({ data }) => {
      const c = { disponivel: 0, reservado: 0, bloqueado: 0 };
      (data || []).forEach((l: { status: keyof typeof c }) => { c[l.status] = (c[l.status] || 0) + 1; });
      setLotes(c);
    });
  }, [reservas]);

  const responsaveis = useMemo(
    () => [...new Set(reservas.map(r => String(r.responsavel_reserva || '')).filter(Boolean))].sort(),
    [reservas]
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = reservas.filter(r =>
      (!fSituacao || situacaoDe(r) === fSituacao) &&
      (!dataDe || String(r.criado_em).slice(0, 10) >= dataDe) &&
      (!dataAte || String(r.criado_em).slice(0, 10) <= dataAte) &&
      (!fResponsavel || r.responsavel_reserva === fResponsavel) &&
      (!q || COLUNAS.some(([c]) => texto(r, c).toLowerCase().includes(q)))
    );
    const { col, asc } = ordem;
    return lista.sort((a, b) => {
      const va = a[col] ?? '';
      const vb = b[col] ?? '';
      const na = col === 'lote' ? Number(va) : NaN;
      const nb = col === 'lote' ? Number(vb) : NaN;
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : String(va).localeCompare(String(vb), 'pt-BR');
      return asc ? cmp : -cmp;
    });
  }, [reservas, busca, fSituacao, fResponsavel, dataDe, dataAte, ordem]);



  function ordenar(col: string) {
    setOrdem(o => (o.col === col ? { col, asc: !o.asc } : { col, asc: true }));
  }

  function exportarCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const linhas = [COLUNAS.map(([, l]) => esc(l)).join(';')];
    filtradas.forEach(r => linhas.push(COLUNAS.map(([c]) => esc(texto(r, c))).join(';')));
    baixar(`reservas-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function exportarPdf() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text(`Reservas — Bairro Erico Verissimo · Fase 2 (${filtradas.length})`, 40, 36);
    doc.setFontSize(8);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 40, 50);
    autoTable(doc, {
      startY: 60,
      head: [VISIVEIS.map(([, l]) => l)],
      body: filtradas.map(r => VISIVEIS.map(([c]) => texto(r, c))),
      styles: { fontSize: VISIVEIS.length > 12 ? 5.5 : VISIVEIS.length > 8 ? 7 : 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [254, 80, 9] },
    });
    doc.save(`reservas-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function mudarSituacao(r: Reserva, nova: 'Ativa' | 'Cancelada') {
    if (nova === situacaoDe(r)) return;
    try {
      if (nova === 'Cancelada') {
        if (!confirm(`Cancelar a reserva do lote ${r.lote}? O lote volta a ficar disponível.`)) return;
        const { error: e1 } = await db.from('reservas').update({ situacao: nova, atualizado_em: new Date().toISOString() }).eq('id', r.id);
        if (e1) throw e1;
        const { error: e2 } = await db.from('reservas_lotes').update({ status: 'disponivel', atualizado_em: new Date().toISOString() }).eq('numero', r.lote);
        if (e2) throw e2;
      } else {
        if (!confirm(`Reativar a reserva do lote ${r.lote}? O lote volta a ficar reservado.`)) return;
        {
          const { data: l } = await db.from('reservas_lotes').select('status').eq('numero', r.lote).single();
          if (l?.status !== 'disponivel') throw new Error(`O lote ${r.lote} já não está disponível.`);
          const { error: e2 } = await db.from('reservas_lotes').update({ status: 'reservado', atualizado_em: new Date().toISOString() }).eq('numero', r.lote);
          if (e2) throw e2;
        }
        const { error: e1 } = await db.from('reservas').update({ situacao: nova, atualizado_em: new Date().toISOString() }).eq('id', r.id);
        if (e1) throw e1;
      }
      await carregar();
    } catch (e) {
      alert(mensagemErro(e));
    }
  }

  return (
    <main className="map-page">
      <section className="map-shell painel">
        <div className="map-toolbar">
          <div>
            <div className="toolbar-title">{admin ? 'Todas as reservas' : 'Minhas reservas'}</div>
            <div className="toolbar-subtitle">
              {admin ? 'Filtre, ordene e exporte as reservas de todos os usuários.' : `Reservas feitas por ${perfil?.email}.`}
            </div>
          </div>
          <div className="acoes">
            {visao === 'tabela' && (
            <div className="colunas-wrap">
              <button className="secondary-button" onClick={() => setEscolhendo(v => !v)}>Colunas ({VISIVEIS.length})</button>
              {escolhendo && (
                <div className="colunas-menu">
                  <div className="colunas-atalhos">
                    <button className="link" onClick={() => mudarColunas(COLUNAS.map(([c]) => c))}>Mostrar todas</button>
                    <button className="link" onClick={() => mudarColunas(PADRAO.map(([c]) => c))}>Padrão</button>
                  </div>
                  {COLUNAS.filter(([c]) => admin || c !== 'criado_por_email').map(([c, l]) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={visiveis.includes(c)}
                        onChange={e => mudarColunas(e.target.checked ? [...visiveis, c] : visiveis.filter(x => x !== c))}
                      />
                      {l}
                    </label>
                  ))}
                </div>
              )}
            </div>
            )}
            <button className="secondary-button" onClick={exportarCsv} disabled={!filtradas.length}>Baixar CSV</button>
            <button className="secondary-button" onClick={exportarPdf} disabled={!filtradas.length}>Baixar PDF</button>
          </div>
        </div>

        <div className="filtros">
          <input placeholder="Buscar por nome, CPF, lote..." value={busca} onChange={e => setBusca(e.target.value)} />
          <select value={fSituacao} onChange={e => setFSituacao(e.target.value)}>
            <option value="">Todas as situações</option>
            {SITUACOES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={fResponsavel} onChange={e => setFResponsavel(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
          <label className="filtro-data">De <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} /></label>
          <label className="filtro-data">Até <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} /></label>
          <div className="alternar">
            <button className={visao === 'dashboard' ? 'ativo' : ''} onClick={() => trocarVisao('dashboard')}>Dashboard</button>
            <button className={visao === 'tabela' ? 'ativo' : ''} onClick={() => trocarVisao('tabela')}>Tabela</button>
          </div>
        </div>

        {erro && <div className="form-error">{erro}</div>}

        {visao === 'dashboard' && <Dashboard reservas={filtradas} lotes={lotes} />}

        {visao === 'tabela' && (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                {VISIVEIS.map(([c, l]) => (
                  <th key={c} onClick={() => ordenar(c)}>
                    {l}{ordem.col === c ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} onClick={() => setDetalhe(r)}>
                  {VISIVEIS.map(([c]) => (
                    <td key={c}>
                      {c === 'situacao' && admin ? (
                        <span className="situacao-celula">
                          <span className={situacaoDe(r) === 'Cancelada' ? 'tag cancelada' : 'tag ativa'}>{situacaoDe(r)}</span>
                          <button
                            className="mini"
                            onClick={e => { e.stopPropagation(); mudarSituacao(r, situacaoDe(r) === 'Cancelada' ? 'Ativa' : 'Cancelada'); }}
                          >
                            {situacaoDe(r) === 'Cancelada' ? 'Reativar' : 'Cancelar'}
                          </button>
                        </span>
                      ) : /^https?:\/\//.test(texto(r, c)) ? (
                        <a href={texto(r, c)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>abrir</a>
                      ) : texto(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
              {!filtradas.length && (
                <tr><td colSpan={VISIVEIS.length || 1} className="vazio">{carregando ? 'Carregando...' : 'Nenhuma reserva.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {detalhe && <Detalhe reserva={detalhe} onClose={() => setDetalhe(null)} onAtualizado={carregar} />}
    </main>
  );
}

function Detalhe({ reserva, onClose, onAtualizado }: { reserva: Reserva; onClose: () => void; onAtualizado: () => void }) {
  const { admin } = useAuth();
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const [atual, setAtual] = useState<Reserva>(reserva);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);

  // Histórico: só admin (a política do banco também bloqueia os demais).
  const carregarHistorico = useCallback(async () => {
    if (!admin) return;
    const { data } = await db.from('reservas_historico')
      .select('id,acao,alteracoes,feito_por_email,feito_em')
      .eq('reserva_id', reserva.id)
      .order('feito_em', { ascending: false });
    setHistorico((data || []) as Historico[]);
  }, [admin, reserva.id]);

  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

  const editaveis = COLUNAS.filter(([c]) => !NAO_EDITAVEIS.has(c));

  function comecarEdicao() {
    setRascunho(Object.fromEntries(editaveis.map(([c]) => [c, paraCampo(atual, c)])));
    setEditando(true);
    setMsg('');
  }

  async function salvarEdicao() {
    const mudancas: Record<string, unknown> = {};
    editaveis.forEach(([c]) => {
      const depois = (rascunho[c] ?? '').trim();
      if (depois === paraCampo(atual, c)) return;
      mudancas[c] = c === 'interesses'
        ? (depois ? depois.split(',').map(x => x.trim()).filter(Boolean) : null)
        : depois || null;
    });
    if (!Object.keys(mudancas).length) { setEditando(false); return; }
    if (!(rascunho.nome ?? '').trim() || !(rascunho.cpf ?? '').trim()) {
      setMsg('Nome e CPF não podem ficar vazios.');
      return;
    }
    setSalvando(true);
    const { data, error } = await db.from('reservas')
      .update({ ...mudancas, atualizado_em: new Date().toISOString() })
      .eq('id', reserva.id).select('*').single();
    setSalvando(false);
    if (error) { setMsg(`Erro ao salvar: ${mensagemErro(error)}`); return; }
    setAtual(data as Reserva);
    setEditando(false);
    setMsg('Alterações salvas.');
    onAtualizado();
    carregarHistorico();
  }

  async function enviarAnexos() {
    const anexos = Object.entries(files).filter(([, f]) => f) as [string, File][];
    if (!anexos.length) return;
    setEnviando(true);
    setMsg('');
    const fd = new FormData();
    fd.append('reserva_id', String(reserva.id));
    anexos.forEach(([k, f]) => fd.append(k, f));
    const { error } = await supabase.functions.invoke(FUNCAO_ANEXOS, { body: fd });
    setEnviando(false);
    if (error) setMsg(`Erro ao enviar: ${mensagemErro(error)}`);
    else {
      setMsg('Anexos enviados.');
      onAtualizado();
      carregarHistorico();
    }
  }

  const link = (v: unknown) => (typeof v === 'string' && /^https?:\/\//.test(v)
    ? <a href={v} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>abrir</a>
    : null);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="reservation-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="reservation-header">
          <div>
            <div className="modal-kicker">Reserva nº {atual.id}</div>
            <h2 className="modal-title">Lote {atual.lote} · {atual.nome}</h2>
          </div>
          <div className="acoes">
            {admin && !editando && <button className="secondary-button" onClick={comecarEdicao} type="button">Editar</button>}
            <button className="close" onClick={onClose} type="button">×</button>
          </div>
        </div>
        <div className="reservation-form">
          {editando ? (
            <div className="form-section">
              <h3>Editar dados da reserva</h3>
              <div className="form-grid">
                {editaveis.map(([c, l]) => (
                  <label className={LONGOS.has(c) ? 'field full' : 'field'} key={c}>
                    <span className="field-label">{l}</span>
                    {LONGOS.has(c) ? (
                      <textarea rows={3} value={rascunho[c] ?? ''} onChange={e => setRascunho(p => ({ ...p, [c]: e.target.value }))} />
                    ) : (
                      <input
                        type={/^data_/.test(c) ? 'date' : 'text'}
                        value={rascunho[c] ?? ''}
                        onChange={e => setRascunho(p => ({ ...p, [c]: e.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              {msg && <p className="field-hint">{msg}</p>}
              <div className="form-actions">
                <button className="secondary-button" onClick={() => { setEditando(false); setMsg(''); }} disabled={salvando} type="button">Descartar</button>
                <button className="primary-button compacto" onClick={salvarEdicao} disabled={salvando} type="button">
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          ) : (
            <dl className="detalhe-lista">
              {COLUNAS.map(([c, l]) => {
                const t = texto(atual, c);
                if (!t) return null;
                return (
                  <div key={c}>
                    <dt>{l}</dt>
                    <dd>{link(atual[c]) || t}</dd>
                  </div>
                );
              })}
            </dl>
          )}

          <div className="form-section">
            <h3>Enviar ou reenviar anexos</h3>
            <div className="form-grid">
              {[
                ['arquivo_titular', 'Documento do titular'],
                ['arquivo_segundo_comprador', 'Documento do segundo comprador'],
                ['arquivo_comprovante_residencia', 'Comprovante de residência'],
                ['arquivo_comprovante_pagamento', 'Comprovante de pagamento'],
              ].map(([k, l]) => (
                <label className="field" key={k}>
                  <span className="field-label">{l}</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setFiles(prev => ({ ...prev, [k]: e.target.files?.[0] || null }))}
                  />
                </label>
              ))}
            </div>
            {msg && !editando && <p className="field-hint">{msg}</p>}
            <div className="form-actions">
              <button className="primary-button compacto" onClick={enviarAnexos} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Enviar anexos'}
              </button>
            </div>
          </div>

          {admin && (
            <div className="form-section">
              <h3>Histórico</h3>
              {!historico.length ? (
                <p className="field-hint">Nenhum registro ainda.</p>
              ) : (
                <ul className="historico">
                  {historico.map(h => (
                    <li key={h.id}>
                      <div className="historico-topo">
                        <strong>{ACOES[h.acao] || h.acao}</strong>
                        <span>{new Date(h.feito_em).toLocaleString('pt-BR')} · {h.feito_por_email || 'sistema'}</span>
                      </div>
                      {h.alteracoes && (
                        <ul>
                          {Object.entries(h.alteracoes).map(([c, v]) => (
                            <li key={c}>
                              <b>{ROTULO[c] || c}:</b> {valorHist(v.de)} → {valorHist(v.para)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
