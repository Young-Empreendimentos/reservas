'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/src/lib/auth';
import { db, FUNCAO_ANEXOS, mensagemErro, supabase, type Reserva } from '@/src/lib/supabase';

const SITUACOES = ['Pendente', 'Aprovada', 'Cancelada'];

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

// Colunas da tabela na tela e no PDF.
const VISIVEIS: [string, string][] = [
  ['criado_em', 'Data'], ['lote', 'Lote'], ['nome', 'Comprador'], ['cpf', 'CPF'], ['telefone', 'Telefone'],
  ['responsavel_reserva', 'Responsável'], ['intermediacao', 'Intermediação'], ['situacao', 'Situação'],
];

function texto(r: Reserva, col: string): string {
  const v = r[col];
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (col === 'criado_em') return new Date(String(v)).toLocaleString('pt-BR');
  if (/^data_/.test(col)) {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
  }
  return String(v);
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

  const responsaveis = useMemo(
    () => [...new Set(reservas.map(r => String(r.responsavel_reserva || '')).filter(Boolean))].sort(),
    [reservas]
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = reservas.filter(r =>
      (!fSituacao || r.situacao === fSituacao) &&
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
  }, [reservas, busca, fSituacao, fResponsavel, ordem]);

  const resumo = useMemo(() => {
    const porSituacao: Record<string, number> = {};
    const porResponsavel: Record<string, number> = {};
    filtradas.forEach(r => {
      porSituacao[r.situacao] = (porSituacao[r.situacao] || 0) + 1;
      const resp = String(r.responsavel_reserva || '—');
      porResponsavel[resp] = (porResponsavel[resp] || 0) + 1;
    });
    const top = Object.entries(porResponsavel).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { porSituacao, top };
  }, [filtradas]);

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
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [254, 80, 9] },
    });
    doc.save(`reservas-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function mudarSituacao(r: Reserva, nova: string) {
    if (nova === r.situacao) return;
    try {
      if (nova === 'Cancelada') {
        if (!confirm(`Cancelar a reserva do lote ${r.lote}? O lote volta a ficar disponível.`)) return;
        const { error: e1 } = await db.from('reservas').update({ situacao: nova, atualizado_em: new Date().toISOString() }).eq('id', r.id);
        if (e1) throw e1;
        const { error: e2 } = await db.from('reservas_lotes').update({ status: 'disponivel', atualizado_em: new Date().toISOString() }).eq('numero', r.lote);
        if (e2) throw e2;
      } else {
        if (r.situacao === 'Cancelada') {
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
            <button className="secondary-button" onClick={exportarCsv} disabled={!filtradas.length}>Baixar CSV</button>
            <button className="secondary-button" onClick={exportarPdf} disabled={!filtradas.length}>Baixar PDF</button>
          </div>
        </div>

        <div className="cards">
          <div className="card"><span>Reservas</span><strong>{filtradas.length}</strong></div>
          {SITUACOES.map(s => (
            <div className="card" key={s}><span>{s}</span><strong>{resumo.porSituacao[s] || 0}</strong></div>
          ))}
          {admin && resumo.top.length > 0 && (
            <div className="card largo">
              <span>Por responsável</span>
              <ul>{resumo.top.map(([n, q]) => <li key={n}>{n}: <b>{q}</b></li>)}</ul>
            </div>
          )}
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
        </div>

        {erro && <div className="form-error">{erro}</div>}

        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                {VISIVEIS.map(([c, l]) => (
                  <th key={c} onClick={() => ordenar(c)}>
                    {l}{ordem.col === c ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                {admin && <th onClick={() => ordenar('criado_por_email')}>Criado por</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} onClick={() => setDetalhe(r)}>
                  {VISIVEIS.map(([c]) => (
                    <td key={c}>
                      {c === 'situacao' && admin ? (
                        <select
                          value={r.situacao}
                          onClick={e => e.stopPropagation()}
                          onChange={e => mudarSituacao(r, e.target.value)}
                        >
                          {SITUACOES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      ) : texto(r, c)}
                    </td>
                  ))}
                  {admin && <td>{texto(r, 'criado_por_email')}</td>}
                </tr>
              ))}
              {!filtradas.length && (
                <tr><td colSpan={VISIVEIS.length + 1} className="vazio">{carregando ? 'Carregando...' : 'Nenhuma reserva.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detalhe && <Detalhe reserva={detalhe} onClose={() => setDetalhe(null)} onAtualizado={carregar} />}
    </main>
  );
}

function Detalhe({ reserva, onClose, onAtualizado }: { reserva: Reserva; onClose: () => void; onAtualizado: () => void }) {
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');

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
            <div className="modal-kicker">Reserva nº {reserva.id}</div>
            <h2 className="modal-title">Lote {reserva.lote} · {reserva.nome}</h2>
          </div>
          <button className="close" onClick={onClose} type="button">×</button>
        </div>
        <div className="reservation-form">
          <dl className="detalhe-lista">
            {COLUNAS.map(([c, l]) => {
              const t = texto(reserva, c);
              if (!t) return null;
              return (
                <div key={c}>
                  <dt>{l}</dt>
                  <dd>{link(reserva[c]) || t}</dd>
                </div>
              );
            })}
          </dl>

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
            {msg && <p className="field-hint">{msg}</p>}
            <div className="form-actions">
              <button className="primary-button compacto" onClick={enviarAnexos} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Enviar anexos'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
