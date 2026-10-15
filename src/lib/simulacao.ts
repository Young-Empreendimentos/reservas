// Mesma conta do Simulador de Vendas (simular-financiamento / gerar-contrato), sem juros:
// saldo = preço − entrada + ITBI (2% do total nominal, iterado) + cartório R$ 2.500; honorários = 5% do preço.
import { SEM_INTERMEDIACAO, valorPorExtenso } from './arras';

const CARTORIO = 2500;
const ITBI = 0.02;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Simulacao = { parcela: number; total: number; itbiCartorio: number; honorarios: number; valorImovel: number; saldo: number };

export function simular(preco: number, entrada: number, parcelas: number, comCorretor: boolean): Simulacao | null {
  if (!(preco > 0) || !(entrada > 0) || !(parcelas >= 1) || entrada >= preco) return null;
  let itbi = 0, parcela = 0;
  for (let i = 0; i < 50; i++) {
    parcela = (preco - entrada + itbi + CARTORIO) / parcelas;
    const novo = (entrada + parcela * parcelas) * ITBI;
    if (Math.abs(novo - itbi) < 0.01) { itbi = novo; break; }
    itbi = novo;
  }
  parcela = r2(parcela);
  const saldo = r2(parcela * parcelas);
  const total = r2(entrada + saldo);
  const itbiCartorio = r2(itbi + CARTORIO);
  const honorarios = comCorretor ? r2(preco * 0.05) : 0;
  return { parcela, total, itbiCartorio, honorarios, saldo, valorImovel: r2(total - honorarios - itbiCartorio) };
}

export function textoPrecoCondicoes(s: Simulacao, entrada: number, parcelas: number): string {
  const partes = [`valor do imóvel de ${valorPorExtenso(s.valorImovel)}`, `custos de ITBI e registro de ${valorPorExtenso(s.itbiCartorio)}`];
  if (s.honorarios > 0) partes.push(`honorários de intermediação imobiliária de ${valorPorExtenso(s.honorarios)}`);
  return `Preço total de ${valorPorExtenso(s.total)} (${partes.join('; ')}), pago com entrada de ${valorPorExtenso(entrada)} e saldo de ${valorPorExtenso(s.saldo)} em ${parcelas} parcelas mensais e consecutivas de ${valorPorExtenso(s.parcela)}, sem juros, corrigidas mensalmente pelo IGP-M/FGV.`;
}

export type Corretor = { nome?: string; cpf?: string; cnpj?: string; creci?: string; endereco?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; telefone?: string; email?: string };

export function textoCorretagem(honorarios: number, c: Corretor | null, nomeResponsavel: string): string {
  if (!(honorarios > 0)) return SEM_INTERMEDIACAO;
  if (!c) return `${valorPorExtenso(honorarios)} em favor de ${nomeResponsavel}.`;
  const faltam = [['CPF/CNPJ', c.cpf || c.cnpj], ['CRECI', c.creci], ['endereço', c.endereco]].filter(([, v]) => !v).map(([k]) => k);
  const aviso = faltam.length ? ` [Completar: ${faltam.join(', ')}]` : '';
  return `${valorPorExtenso(honorarios)} em favor de ${c.nome ?? ''}, inscrito no CPF/CNPJ sob o nº ${c.cpf || c.cnpj || ''}, CRECI ${c.creci ?? ''}, com endereço na ${c.endereco ?? ''}, ${c.bairro ?? ''}, ${c.cidade ?? ''}/${c.uf ?? ''}, CEP ${c.cep ?? ''}, fone ${c.telefone ?? ''}, e-mail ${c.email ?? ''}.${aviso}`;
}
