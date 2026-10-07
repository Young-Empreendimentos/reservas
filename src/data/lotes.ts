import raw from './lotes.json';

export type Lote = {
  numero: string;
  d: string;
  metragem?: number | null;
  preco?: number | null;
  status: 'disponivel' | 'reservado';
};

export const lotes: Lote[] = raw.map((lote) => ({
  ...lote,
  status: lote.status === 'reservado' ? 'reservado' : 'disponivel',
}));
