'use client';

import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Reserva } from '@/src/lib/supabase';

// Cores validadas (skill dataviz): série única = laranja Young; partes de um todo (até 3) = azul/laranja/aqua.
const COR = '#fe5009';
const PARTES = ['#2a78d6', '#eb6834', '#1baf7a'];
const TINTA = '#52514e';
const GRADE = '#ececea';

type Item = { nome: string; valor: number };

function contar(valores: (string | null | undefined)[], ordem?: string[]): Item[] {
  const m = new Map<string, number>();
  for (const v of valores) {
    const k = String(v ?? '').trim();
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  const itens = [...m.entries()].map(([nome, valor]) => ({ nome, valor }));
  if (ordem) return itens.sort((a, b) => idx(ordem, a.nome) - idx(ordem, b.nome));
  return itens.sort((a, b) => b.valor - a.valor);
}
const idx = (ordem: string[], v: string) => (ordem.indexOf(v) === -1 ? 999 : ordem.indexOf(v));

// Mais de N categorias: as menores viram "Outros".
function topN(itens: Item[], n: number): Item[] {
  if (itens.length <= n) return itens;
  const resto = itens.slice(n - 1).reduce((s, i) => s + i.valor, 0);
  return [...itens.slice(0, n - 1), { nome: 'Outros', valor: resto }];
}

function faixaEtaria(iso: unknown): string | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const h = new Date();
  let idade = h.getFullYear() - Number(m[1]);
  if (h.getMonth() + 1 < Number(m[2]) || (h.getMonth() + 1 === Number(m[2]) && h.getDate() < Number(m[3]))) idade--;
  if (idade < 18 || idade > 110) return null;
  if (idade <= 24) return '18–24';
  if (idade <= 34) return '25–34';
  if (idade <= 44) return '35–44';
  if (idade <= 54) return '45–54';
  if (idade <= 64) return '55–64';
  return '65+';
}

const ORDEM_IDADE = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'];
const ORDEM_RENDA = ['Até 3 mil reais', '3 a 5 mil reais', '5 a 10 mil reais', '10 a 15 mil reais', '15 a 20 mil reais', 'Acima de 20 mil reais'];

export type ResumoLotes = { disponivel: number; reservado: number; bloqueado: number };

export default function Dashboard({ reservas, lotes }: { reservas: Reserva[]; lotes: ResumoLotes }) {
  const ativas = useMemo(() => reservas.filter(r => r.situacao !== 'Cancelada'), [reservas]);
  const canceladas = reservas.length - ativas.length;

  const d = useMemo(() => {
    const col = (c: string) => ativas.map(r => r[c] as string | null);

    // Série diária contínua (dias sem reserva aparecem com zero).
    const porDia = new Map<string, number>();
    ativas.forEach(r => {
      const k = String(r.criado_em).slice(0, 10);
      porDia.set(k, (porDia.get(k) || 0) + 1);
    });
    const dias = [...porDia.keys()].sort();
    const serie: { dia: string; reservas: number; acumulado: number }[] = [];
    if (dias.length) {
      let acum = 0;
      for (let t = new Date(dias[0] + 'T12:00:00'); t <= new Date(dias[dias.length - 1] + 'T12:00:00'); t.setDate(t.getDate() + 1)) {
        const k = t.toISOString().slice(0, 10);
        const n = porDia.get(k) || 0;
        acum += n;
        serie.push({ dia: `${k.slice(8, 10)}/${k.slice(5, 7)}`, reservas: n, acumulado: acum });
      }
    }

    return {
      serie,
      responsavel: topN(contar(col('responsavel_reserva')), 10),
      intermediacao: topN(contar(col('intermediacao')), 3),
      pagamento: topN(contar(col('forma_pagamento')), 3),
      origem: topN(contar(col('origem')), 8),
      motivo: contar(col('motivo_compra')),
      idade: contar(ativas.map(r => faixaEtaria(r.data_nascimento)), ORDEM_IDADE),
      renda: contar(col('renda_familiar'), ORDEM_RENDA),
      cidade: topN(contar(col('cidade')), 8),
      interesses: topN(contar(ativas.flatMap(r => (Array.isArray(r.interesses) ? r.interesses : []) as string[])), 8),
      listas: [
        ['Profissão', contar(col('profissao'))],
        ['Escolaridade', contar(col('escolaridade'))],
        ['Estado civil', contar(col('estado_civil'))],
        ['Sexo', contar(col('sexo'))],
        ['Filhos', contar(col('filhos'))],
        ['Tipo de residência', contar(col('tipo_residencia'))],
        ['Tempo no endereço atual', contar(col('tempo_residencia'))],
        ['Nacionalidade', contar(col('nacionalidade'))],
        ['Terrenos que está adquirindo', contar(col('quantidade_terrenos'))],
        ['Nota de recomendação (1 a 10)', contar(col('recomendacao'))],
      ] as [string, Item[]][],
    };
  }, [ativas]);

  const aVenda = lotes.disponivel + lotes.reservado;

  return (
    <div className="dash-looker">
      <div className="scorecards">
        <Score titulo="Reservas ativas" valor={ativas.length} />
        <Score titulo="Canceladas" valor={canceladas} />
        <Score titulo="Lotes disponíveis" valor={lotes.disponivel} />
        <Score titulo="Lotes reservados" valor={lotes.reservado} />
        <Score titulo="Ocupação dos lotes à venda" valor={aVenda ? `${Math.round((lotes.reservado / aVenda) * 100)}%` : '—'} />
      </div>

      {!ativas.length ? (
        <p className="vazio">Nenhuma reserva ativa para os filtros escolhidos.</p>
      ) : (
        <div className="graficos">
          <Painel titulo="Reservas por dia" largo>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.serie} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRADE} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={{ stroke: GRADE }} minTickGap={12} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} formatter={(v: number) => [v, 'Reservas']} />
                <Bar isAnimationActive={false} dataKey="reservas" fill={COR} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </Painel>

          <Painel titulo="Reservas acumuladas" largo>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.serie} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRADE} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={{ stroke: GRADE }} minTickGap={12} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [v, 'Acumulado']} />
                <Area isAnimationActive={false} type="monotone" dataKey="acumulado" stroke={COR} strokeWidth={2} fill={COR} fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Painel>

          <BarrasHorizontais titulo="Reservas por responsável" dados={d.responsavel} />
          <Rosca titulo="Intermediação" dados={d.intermediacao} />
          <Rosca titulo="Forma de pagamento" dados={d.pagamento} />
          <BarrasHorizontais titulo="Como ficou sabendo" dados={d.origem} />
          <Colunas titulo="Faixa etária" dados={d.idade} />
          <Colunas titulo="Renda familiar" dados={d.renda} />
          <BarrasHorizontais titulo="Motivo da compra" dados={d.motivo} />
          <BarrasHorizontais titulo="Cidade onde reside" dados={d.cidade} />
          <BarrasHorizontais titulo="Interesses pessoais" dados={d.interesses} />
          {d.listas.map(([t, itens]) => <Lista key={t} titulo={t} dados={itens} />)}
        </div>
      )}
    </div>
  );
}

function Score({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <div className="score">
      <span>{titulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function Painel({ titulo, largo, children }: { titulo: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <section className={`painel-grafico ${largo ? 'largo' : ''}`}>
      <h4>{titulo}</h4>
      {children}
    </section>
  );
}

function BarrasHorizontais({ titulo, dados }: { titulo: string; dados: Item[] }) {
  const altura = Math.max(120, dados.length * 30 + 20);
  return (
    <Painel titulo={titulo}>
      {!dados.length ? <p className="sem-dados">Sem dados.</p> : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 34, left: 4, bottom: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false}
              tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + '…' : v)} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} formatter={(v: number) => [v, 'Reservas']} />
            <Bar isAnimationActive={false} dataKey="valor" fill={COR} radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList dataKey="valor" position="right" style={{ fontSize: 11, fill: TINTA }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Painel>
  );
}

function Colunas({ titulo, dados }: { titulo: string; dados: Item[] }) {
  return (
    <Painel titulo={titulo}>
      {!dados.length ? <p className="sem-dados">Sem dados.</p> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dados} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRADE} />
            <XAxis dataKey="nome" tick={{ fontSize: 10, fill: TINTA }} tickLine={false} axisLine={{ stroke: GRADE }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} formatter={(v: number) => [v, 'Reservas']} />
            <Bar isAnimationActive={false} dataKey="valor" fill={COR} radius={[4, 4, 0, 0]} maxBarSize={36}>
              <LabelList dataKey="valor" position="top" style={{ fontSize: 11, fill: TINTA }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Painel>
  );
}

function Rosca({ titulo, dados }: { titulo: string; dados: Item[] }) {
  const total = dados.reduce((s, i) => s + i.valor, 0);
  return (
    <Painel titulo={titulo}>
      {!dados.length ? <p className="sem-dados">Sem dados.</p> : (
        <div className="rosca">
          <PieChart width={160} height={160}>
              <Pie isAnimationActive={false} data={dados} dataKey="valor" nameKey="nome" innerRadius={44} outerRadius={70} cx={80} cy={80} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                {dados.map((_, i) => <Cell key={i} fill={PARTES[i % PARTES.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [`${v} (${Math.round((v / total) * 100)}%)`, n]} />
            </PieChart>
          <ul className="legenda">
            {dados.map((i, k) => (
              <li key={i.nome}>
                <span className="ponto" style={{ background: PARTES[k % PARTES.length] }} />
                <span className="nome">{i.nome}</span>
                <b>{Math.round((i.valor / total) * 100)}%</b>
                <small>{i.valor}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Painel>
  );
}

function Lista({ titulo, dados }: { titulo: string; dados: Item[] }) {
  const total = dados.reduce((s, i) => s + i.valor, 0);
  const max = dados[0]?.valor || 0;
  return (
    <Painel titulo={titulo}>
      {!dados.length ? <p className="sem-dados">Sem dados.</p> : dados.slice(0, 6).map(i => (
        <div className="barra" key={i.nome} title={i.nome}>
          <div className="barra-fundo" style={{ width: `${max ? (i.valor / max) * 100 : 0}%` }} />
          <span className="barra-rotulo">{i.nome}</span>
          <span className="barra-valor"><b>{Math.round((i.valor / total) * 100)}%</b> · {i.valor}</span>
        </div>
      ))}
    </Painel>
  );
}
