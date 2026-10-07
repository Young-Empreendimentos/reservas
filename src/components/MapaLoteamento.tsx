'use client';

import { useEffect, useMemo, useState } from 'react';
import FormularioReserva from './FormularioReserva';
import { lotes as lotesBase, type Lote } from '@/src/data/lotes';
import { db, mensagemErro, type LoteDb } from '@/src/lib/supabase';

function formatMoney(value?: number | null) {
  if (value === undefined || value === null) return 'Preço não cadastrado';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatArea(value?: number | null) {
  if (value === undefined || value === null) return 'Metragem não cadastrada';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`;
}

// Geometria do arquivo + status/área/preço do banco. Bloqueado aparece como reservado.
function mergeLotes(doBanco: LoteDb[]) {
  const porNumero = new Map(doBanco.map(l => [l.numero, l]));
  return lotesBase.map((base) => {
    const l = porNumero.get(String(base.numero));
    if (!l) return { ...base, status: 'reservado' } satisfies Lote;
    return {
      ...base,
      metragem: l.area ?? base.metragem,
      preco: l.preco,
      status: l.status === 'disponivel' ? 'disponivel' : 'reservado',
    } satisfies Lote;
  });
}

export default function MapaLoteamento() {
  const [lotes, setLotes] = useState<Lote[]>(lotesBase);
  const [aviso, setAviso] = useState('');
  const [selected, setSelected] = useState<Lote | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [reserving, setReserving] = useState<Lote | null>(null);

  async function carregarLotes() {
    try {
      const { data, error } = await db.from('reservas_lotes').select('numero,area,matricula,preco,status');
      if (error) throw error;
      setLotes(mergeLotes((data || []) as LoteDb[]));
      setOnline(true);
      setLastUpdate(new Date().toISOString());
    } catch (e) {
      console.error('Lotes:', mensagemErro(e));
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarLotes();
    const interval = window.setInterval(carregarLotes, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const availableCount = useMemo(
    () => lotes.filter((lote) => lote.status === 'disponivel').length,
    [lotes],
  );

  const reservedCount = lotes.length - availableCount;

  return (
    <main className="map-page">
      <section className="map-shell">
        <div className="map-toolbar">
          <div>
            <div className="toolbar-title">Mapa de reservas</div>
            <div className="toolbar-subtitle">
              Selecione um lote para consultar os dados e iniciar uma reserva.
            </div>
          </div>
          <div className="legend">
            <div className="legend-item"><span className="legend-dot available" /> Disponível</div>
            <div className="legend-item"><span className="legend-dot reserved" /> Reservado</div>
            <div>{availableCount} disponíveis · {reservedCount} reservados</div>
            <div className={`connection ${online ? 'online' : ''}`}>
              <span /> {loading ? 'Conectando...' : online ? 'Atualizado' : 'Sem conexão'}
            </div>
          </div>
        </div>

        <div className="map-viewport">
          <img
            className="map-image"
            src="/implantacao-com-numeros.png"
            alt="Implantação do loteamento com numeração dos lotes"
          />

          <svg
            className="map-reserved-image"
            viewBox="0 0 6000 2609"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <clipPath id="reserved-lots-clip">
                {lotes
                  .filter((lote) => lote.status === 'reservado')
                  .map((lote) => (
                    <path key={lote.numero} d={lote.d} />
                  ))}
              </clipPath>
            </defs>
            <image
              href="/fundo.png"
              x="0"
              y="0"
              width="6000"
              height="2609"
              preserveAspectRatio="none"
              clipPath="url(#reserved-lots-clip)"
            />
          </svg>

          <svg
            className="map-svg"
            viewBox="0 0 6000 2609"
            preserveAspectRatio="none"
            aria-label="Mapa interativo dos lotes"
          >
            {lotes.map((lote) => (
              <path
                key={lote.numero}
                d={lote.d}
                className="lot-path"
                onClick={() => setSelected(lote)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelected(lote);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Lote ${lote.numero} — ${lote.status === 'disponivel' ? 'disponível' : 'reservado'}`}
              />
            ))}
          </svg>
        </div>

        {aviso && (
          <div className="aviso-faixa" onClick={() => setAviso('')}>{aviso} <span>×</span></div>
        )}

        {lastUpdate && (
          <div className="map-footer">
            Última atualização: {new Date(lastUpdate).toLocaleString('pt-BR')}
          </div>
        )}
      </section>

      {selected && !reserving && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-top">
              <div>
                <div className="modal-kicker">Lote selecionado</div>
                <h2 className="modal-title">Lote {selected.numero}</h2>
              </div>
              <button className="close" onClick={() => setSelected(null)} aria-label="Fechar">×</button>
            </div>

            <div className="modal-body">
              <div className={`status ${selected.status}`}>
                {selected.status === 'disponivel' ? 'Disponível para reserva' : 'Lote reservado'}
              </div>

              <div className="lot-data">
                <div className="data-card">
                  <div className="data-label">Metragem</div>
                  <div className="data-value">{formatArea(selected.metragem)}</div>
                </div>
                <div className="data-card">
                  <div className="data-label">Preço</div>
                  <div className="data-value">{formatMoney(selected.preco)}</div>
                </div>
              </div>

              {selected.status === 'disponivel' && online ? (
                <button
                  className="primary-button"
                  onClick={() => setReserving(selected)}
                >
                  Reservar lote {selected.numero}
                </button>
              ) : (
                <div className="notice">Este lote está reservado e não pode receber uma nova reserva.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {reserving && (
        <FormularioReserva
          lote={reserving}
          onClose={() => setReserving(null)}
          onSuccess={(msg) => { setSelected(null); setReserving(null); setAviso(msg); carregarLotes(); }}
        />
      )}
    </main>
  );
}
