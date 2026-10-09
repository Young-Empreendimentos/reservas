import type { Perfil } from './supabase';

export const INTERMEDIACAO_YOUNG = 'Young';
export const INTERMEDIACAO_PARCEIRO = 'Corretor parceiro / Imobiliária';
export const INTERMEDIACOES = [INTERMEDIACAO_YOUNG, INTERMEDIACAO_PARCEIRO];

// Responsável depende da intermediação: colaboradores da Young ou parceiros
// (parceiros = contratos de corretagem na pasta do Drive "Corretores parceiros", 2026-10-09).
export const RESPONSAVEIS_YOUNG = ['Carol Bortoluzzi','Eduardo Tebaldi','Helen Cardoso','Joana Mantovane','Matheus Vargas'];
export const RESPONSAVEIS_PARCEIROS = ['Aline Imóveis','Andressa Aparecida de Mello Kovaleski','Cristian Imóveis','Erthal Imóveis','Falcão Imóveis','Imobiliária Cruz Alta','Imobiliária Domingues','Imobiliária Gaúcha','Imobiliária Profit','Jean da Silva de Godoy','Lamaison Imóveis','Luis Felipe Machado Pinto','Mariana Baumhardt','Mastercruz Imobiliária','Matheus Padilha','Pedro Mariano Imóveis','Personal Imóveis','Premium Imóveis','Realizzi Imóveis','RG Imóveis','Rodrigo Schimidt','Simone - Di Bento Imóveis','Stéfani Dal Forno Appelt','Távola Imobiliária','Tiago Medina de Moura','Valdair Didone'];

export function intermediacaoDe(responsavel: string): string {
  if (RESPONSAVEIS_YOUNG.includes(responsavel)) return INTERMEDIACAO_YOUNG;
  if (RESPONSAVEIS_PARCEIROS.includes(responsavel)) return INTERMEDIACAO_PARCEIRO;
  return '';
}

const palavras = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean);

// "Carol Bortoluzzi" casa com "Caroline Bortoluzzi" (prefixo); cada palavra do responsável precisa aparecer no nome.
function casaNome(responsavel: string, nome: string): boolean {
  const doNome = palavras(nome);
  const doResp = palavras(responsavel);
  return doResp.length > 1 && doResp.every(p => doNome.some(n => n.startsWith(p)));
}

// Responsável da conta logada: o vínculo definido pelo admin ou, sem ele, pelo nome da conta Google.
export function vinculoDoUsuario(perfil: Perfil | null): { intermediacao: string; responsavel: string } {
  const vinculado = perfil?.responsavel || '';
  if (vinculado && intermediacaoDe(vinculado)) return { intermediacao: intermediacaoDe(vinculado), responsavel: vinculado };

  const nome = perfil?.nome || '';
  const achados = [...RESPONSAVEIS_YOUNG, ...RESPONSAVEIS_PARCEIROS].filter(r => casaNome(r, nome));
  if (achados.length === 1) return { intermediacao: intermediacaoDe(achados[0]), responsavel: achados[0] };

  if (/@youngempreendimentos\.com\.br$/i.test(perfil?.email || '')) return { intermediacao: INTERMEDIACAO_YOUNG, responsavel: '' };
  return { intermediacao: '', responsavel: '' };
}
