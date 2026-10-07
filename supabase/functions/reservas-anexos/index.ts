// Edge Function: recebe os anexos de uma reserva e salva no Google Drive (via Apps Script).
// Segurança: exige login; só o dono da reserva ou um admin aprovado pode enviar.
// O endereço do Apps Script e o token ficam só nos segredos da função (APPS_SCRIPT_URL, ANEXOS_TOKEN).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TIPOS = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 15 * 1024 * 1024;
const CAMPOS = ['arquivo_titular', 'arquivo_segundo_comprador', 'arquivo_comprovante_residencia', 'arquivo_comprovante_pagamento'];

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// O Apps Script responde o POST com redirect; segue com GET e tenta de novo se o resultado ainda não saiu.
async function postAppsScript(url: string, payload: string): Promise<Response> {
  const first = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload, redirect: 'manual' });
  const location = first.headers.get('location');
  if (first.status < 300 || first.status >= 400 || !location) return first;
  let last = first;
  for (let t = 0; t < 4; t++) {
    if (t > 0) await new Promise(r => setTimeout(r, 1500 * t));
    last = await fetch(location);
    if (last.ok) return last;
  }
  return last;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return j({ error: 'Use POST.' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(jwt);
  const email = u?.user?.email?.toLowerCase();
  if (!u?.user || !email) return j({ error: 'Login obrigatório.' }, 401);

  const { data: perfil } = await admin.schema('marketing').from('reservas_usuarios')
    .select('papel,status').eq('email', email).maybeSingle();
  if (!perfil || perfil.status !== 'aprovado') return j({ error: 'Acesso não liberado.' }, 403);

  const form = await req.formData();
  const reservaId = Number(form.get('reserva_id'));
  if (!reservaId) return j({ error: 'Reserva não informada.' }, 400);

  const { data: reserva } = await admin.schema('marketing').from('reservas')
    .select('id,lote,cpf,nome,criado_por').eq('id', reservaId).maybeSingle();
  if (!reserva) return j({ error: 'Reserva não encontrada.' }, 404);
  if (reserva.criado_por !== u.user.id && perfil.papel !== 'admin') return j({ error: 'Sem permissão para esta reserva.' }, 403);

  const arquivos: Record<string, unknown> = {};
  for (const campo of CAMPOS) {
    const f = form.get(campo);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!TIPOS.has(f.type)) return j({ error: `Tipo de arquivo não permitido: ${f.name}` }, 400);
    if (f.size > MAX_BYTES) return j({ error: `Arquivo maior que 15 MB: ${f.name}` }, 400);
    arquivos[campo] = { nome: f.name, tipo: f.type, tamanho: f.size, conteudoBase64: base64(new Uint8Array(await f.arrayBuffer())) };
  }
  if (!Object.keys(arquivos).length) return j({ error: 'Nenhum arquivo enviado.' }, 400);

  const resp = await postAppsScript(Deno.env.get('APPS_SCRIPT_URL')!, JSON.stringify({
    action: 'anexos',
    token: Deno.env.get('ANEXOS_TOKEN'),
    numero: reserva.lote,
    cpf: reserva.cpf,
    nome: reserva.nome,
    arquivos,
  }));
  let r: Record<string, string> = {};
  try { r = await resp.json(); } catch { /* resposta não-JSON */ }
  if (!resp.ok || !r.ok) return j({ error: r.error || `Falha ao salvar no Drive (HTTP ${resp.status}).` }, 502);

  // Grava só os links que vieram (reenvio não apaga os anteriores).
  const links: Record<string, string> = {};
  if (r.pasta) links.pasta_anexos = r.pasta;
  if (r.identidade) links.documento_titular = r.identidade;
  if (r.documentoSegundoComprador) links.documento_segundo_comprador = r.documentoSegundoComprador;
  if (r.comprovanteResidencia) links.comprovante_residencia = r.comprovanteResidencia;
  if (r.comprovantePagamento) links.comprovante_pagamento = r.comprovantePagamento;

  const { error } = await admin.schema('marketing').from('reservas')
    .update({ ...links, atualizado_em: new Date().toISOString() }).eq('id', reservaId);
  if (error) return j({ error: 'Arquivos salvos, mas não foi possível gravar os links.' }, 500);

  return j({ ok: true, ...links });
});
