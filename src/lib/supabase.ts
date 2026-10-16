import { createBrowserClient } from '@supabase/ssr';

// SSO da Young (02/10/2026): sessão em COOKIE no domínio pai .youngempreendimentos.com.br
// (@supabase/ssr), e não no localStorage — logar em qualquer sistema vale em todos.
// Em localhost o cookie fica só no host local. Regra: signOut SEMPRE com { scope: 'local' }.
const YOUNG_DOMAIN = 'youngempreendimentos.com.br'
const _host = typeof window !== 'undefined' ? window.location.hostname : ''
const SSO_COOKIE_OPTIONS = {
  domain: _host === YOUNG_DOMAIN || _host.endsWith('.' + YOUNG_DOMAIN) ? '.' + YOUNG_DOMAIN : undefined,
  path: '/',
  sameSite: 'lax' as const,
  secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : true,
}

// Projeto young-workspace. A chave publicável foi feita para ficar no navegador:
// quem protege os dados são as regras de acesso (RLS) das tabelas do schema marketing.
// Nada sensível fica no código: reservas, clientes e o texto do Outorgante estão no banco.
export const SUPABASE_URL = 'https://vvtympzatclvjaqucebr.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VRzI66cuw15hnqnoPKe27A_UmUbuhPC';

// Cliente OAuth próprio do Reservas (projeto Google Cloud separado, Externo). Vazio = usa o login Young.
export const GOOGLE_CLIENT_ID_RESERVAS = '1042219060275-ooh22uebgro17vm67otbh9950n7lk06s.apps.googleusercontent.com';

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  cookieOptions: SSO_COOKIE_OPTIONS,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const db = supabase.schema('marketing');

// Edge Function que salva os anexos no Drive (código em supabase/functions/reservas-anexos;
// publicada no Supabase com o nome "dynamic-service").
export const FUNCAO_ANEXOS = 'dynamic-service';

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
  responsavel: string | null;
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
