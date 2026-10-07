import { createClient } from '@supabase/supabase-js';

// Projeto young-workspace. A chave publicável foi feita para ficar no navegador:
// quem protege os dados são as regras de acesso (RLS) das tabelas do schema marketing.
// Nada sensível fica no código: reservas, clientes e o texto do Outorgante estão no banco.
export const SUPABASE_URL = 'https://vvtympzatclvjaqucebr.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VRzI66cuw15hnqnoPKe27A_UmUbuhPC';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const db = supabase.schema('marketing');

export type Perfil = {
  id: string;
  user_id: string | null;
  email: string;
  nome: string | null;
  papel: 'admin' | 'usuario';
  status: 'pendente' | 'aprovado' | 'recusado';
  criado_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
};

export type LoteDb = {
  numero: string;
  area: number | null;
  matricula: number | null;
  preco: number | null;
  status: 'disponivel' | 'reservado' | 'bloqueado';
};

export type Reserva = Record<string, unknown> & {
  id: number;
  criado_em: string;
  criado_por_email: string | null;
  lote: string;
  nome: string;
  cpf: string;
  situacao: string;
};

export function mensagemErro(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e ?? 'Erro desconhecido.');
}
