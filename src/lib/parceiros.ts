'use client';

import { useEffect, useState } from 'react';
import { db } from './supabase';
import { RESPONSAVEIS_PARCEIROS } from './responsaveis';

// Corretores parceiros = cadastro do Simulador de Vendas (marketing.reservas_corretores_lista lê comercial_corretores).
// Os do Erico ("CAY - ...") vêm primeiro. Sem acesso à função, usa a lista antiga.
let cache: string[] | null = null;

export function useParceiros(): string[] {
  const [lista, setLista] = useState<string[]>(cache ?? RESPONSAVEIS_PARCEIROS);
  useEffect(() => {
    if (cache) return;
    db.rpc('reservas_corretores_lista').then(({ data, error }) => {
      if (error || !data?.length) return;
      const nomes = (data as { nome: string }[]).map(d => d.nome).filter(Boolean);
      // Corretores do Erico sem o prefixo "CAY - " no cadastro (têm contrato de corretagem do Erico).
      const EXTRAS_CAY = ['simone soares balestieri'];
      const cay = nomes.filter(n => /^cay\b/i.test(n) || EXTRAS_CAY.includes(n.trim().toLowerCase()));
      if (!cay.length) return;
      cache = cay;   // só os corretores do Erico ("CAY - ...")
      setLista(cache);
    });
  }, []);
  return lista;
}

// Garante que o valor já escolhido aparece na lista (vínculos antigos).
export const comAtual = (lista: string[], atual: string) => (atual && !lista.includes(atual) ? [atual, ...lista] : lista);
