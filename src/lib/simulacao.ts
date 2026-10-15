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

export type Pagamento = { dataEntrada: string; dataPrimeira?: string; bancoEmpresa: string; bancoCorretor: string };

const dataBR = (iso: string) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '____/____/______'; };

function cabecalho(s: Simulacao): string {
  const partes = [`valor do imóvel de ${valorPorExtenso(s.valorImovel)}`, `custos de ITBI e registro de ${valorPorExtenso(s.itbiCartorio)}`];
  if (s.honorarios > 0) partes.push(`honorários de intermediação imobiliária de ${valorPorExtenso(s.honorarios)}`);
  return `Preço total de ${valorPorExtenso(s.total)} (${partes.join('; ')}), pago da seguinte forma:`;
}

const linhaHonorarios = (n: string, s: Simulacao, pg: Pagamento) =>
  `${n} HONORÁRIOS DE INTERMEDIAÇÃO IMOBILIÁRIA de ${valorPorExtenso(s.honorarios)}, mediante transferência eletrônica diretamente pelo OUTORGADO ao beneficiário qualificado no Campo 6, para os dados bancários ${pg.bancoCorretor || '__________'}.`;

// Mesmo formato do Campo 4 do contrato gerado pelo Simulador (entrada líquida = entrada − honorários).
export function textoPrecoCondicoes(s: Simulacao, entrada: number, parcelas: number, pg: Pagamento): string {
  const linhas = [cabecalho(s)];
  let k = 1;
  linhas.push(`5.${k++} ENTRADA de ${valorPorExtenso(Math.round((entrada - s.honorarios) * 100) / 100)}, através de transferência bancária, até a data de ${dataBR(pg.dataEntrada)} em favor da OUTORGANTE, ${pg.bancoEmpresa || '__________'}.`);
  if (s.honorarios > 0) linhas.push(linhaHonorarios(`5.${k++}`, s, pg));
  linhas.push(`5.${k++} SALDO de ${valorPorExtenso(s.saldo)}, através de boleto bancário, em ${parcelas} parcelas mensais e consecutivas no valor de ${valorPorExtenso(s.parcela)}, sem juros, corrigidas mensalmente pelo IGP-M/FGV, sendo a primeira com vencimento em ${dataBR(pg.dataPrimeira || '')} e as demais nos meses subsequentes.`);
  return linhas.join('\n');
}

// À vista: preço da tabela + ITBI (2% do preço) + cartório R$ 2.500; honorários de 5% dentro do total.
export function simularAvista(preco: number, comCorretor: boolean): Simulacao | null {
  if (!(preco > 0)) return null;
  const itbiCartorio = r2(preco * ITBI + CARTORIO);
  const honorarios = comCorretor ? r2(preco * 0.05) : 0;
  const total = r2(preco + itbiCartorio);
  return { parcela: 0, saldo: 0, total, itbiCartorio, honorarios, valorImovel: r2(total - honorarios - itbiCartorio) };
}

export function textoAvista(s: Simulacao, pg: Pagamento): string {
  const linhas = [cabecalho(s)];
  linhas.push(`5.1 ${valorPorExtenso(r2(s.total - s.honorarios))}, através de transferência bancária, até a data de ${dataBR(pg.dataEntrada)} em favor da OUTORGANTE, ${pg.bancoEmpresa || '__________'}.`);
  if (s.honorarios > 0) linhas.push(linhaHonorarios('5.2', s, pg));
  return linhas.join('\n');
}

export type Corretor = { nome?: string; cpf?: string; cnpj?: string; creci?: string; endereco?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; telefone?: string; email?: string; dados_bancarios?: string };

export function textoCorretagem(honorarios: number, c: Corretor | null, nomeResponsavel: string): string {
  if (!c) return SEM_INTERMEDIACAO;
  const valor = honorarios > 0 ? valorPorExtenso(honorarios) : '5% do preço de tabela';
  const faltam = [['CPF/CNPJ', c.cpf || c.cnpj], ['CRECI', c.creci], ['endereço', c.endereco]].filter(([, v]) => !v).map(([k]) => k);
  const aviso = faltam.length ? ` [Completar: ${faltam.join(', ')}]` : '';
  const local = [c.endereco, c.bairro, c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade].filter(Boolean).join(', ');
  const partes = [
    `${valor} em favor de ${c.nome || nomeResponsavel}`,
    (c.cpf || c.cnpj) && `inscrito no CPF/CNPJ sob o nº ${c.cpf || c.cnpj}`,
    c.creci && `CRECI ${c.creci}`,
    local && `com endereço na ${local}`,
    c.cep && `CEP ${c.cep}`,
    c.telefone && `fone ${c.telefone}`,
    c.email && `e-mail ${c.email}`,
  ].filter(Boolean);
  return `${partes.join(', ')}.${aviso}`;
}
