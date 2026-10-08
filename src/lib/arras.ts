// Termo de Outorga de Direito de Preferência (arras) — Erico Verissimo Fase 2.
// O PDF é montado do zero (sem template), com o texto do modelo
// "Arras CAY reservas" (Google Docs 1kBuC0jBz3FNtnvfQUo7ELco6T5wqaodZxQyBmu-v54w):
// layout compacto e células do Quadro Resumo que crescem com o conteúdo.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import detalhes from '@/src/data/lotes-detalhes.json';

export const VALOR_ARRAS = 2000;
export const VALOR_ARRAS_TEXTO =
  'R$ 2.000,00 (dois mil reais), pagos diretamente à Outorgante, CAY Empreendimentos Imobiliários SPE Ltda., via PIX para a chave CNPJ 46.138.992/0001-19.';
export const SEM_INTERMEDIACAO = 'A presente transação não é objeto de intermediação imobiliária.';

// A qualificação do Outorgante (dados pessoais) fica no banco: marketing.reservas_config,
// chave 'outorgante'. Não colocar esse texto no código, que é público.

// ── Valores por extenso (mesma regra do gerador de contrato do Simulador de Vendas) ──

export function extenso(valor: number): string {
  const n = Math.round(Number(valor) * 100);
  const reais = Math.floor(n / 100);
  const centavos = n % 100;
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function grupo(x: number): string {
    const c = Math.floor(x / 100);
    const resto = x % 100;
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    const parts: string[] = [];
    if (c > 0) { if (c === 1 && resto > 0) parts.push('cento'); else parts.push(centenas[c]); }
    if (resto >= 20) { parts.push(dezenas[d]); if (u > 0) parts.push(unidades[u]); }
    else if (resto > 0) parts.push(unidades[resto]);
    return parts.join(' e ');
  }
  function parteInteira(x: number): string {
    if (x === 0) return 'zero';
    const milhoes = Math.floor(x / 1_000_000);
    const milhares = Math.floor((x % 1_000_000) / 1_000);
    const resto = x % 1_000;
    // "e" entre as classes só quando a seguinte é < 100 ou centena redonda
    // (mil e duzentos; mil trezentos e cinquenta).
    const usaE = (x: number) => x < 100 || x % 100 === 0;
    let r = '';
    const juntar = (txt: string, valor: number) => {
      r += r ? (usaE(valor) ? ' e ' : ' ') + txt : txt;
    };
    if (milhoes > 0) juntar(grupo(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'), milhoes * 1000);
    if (milhares > 0) juntar(milhares === 1 ? 'mil' : grupo(milhares) + ' mil', milhares);
    if (resto > 0) juntar(grupo(resto), resto);
    return r;
  }
  let r = '';
  if (reais > 0) r += parteInteira(reais) + (reais === 1 ? ' real' : ' reais');
  if (centavos > 0) { if (reais > 0) r += ' e '; r += parteInteira(centavos) + (centavos === 1 ? ' centavo' : ' centavos'); }
  return r || 'zero reais';
}

const fmtReais = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const valorPorExtenso = (v: number) => `R$ ${fmtReais(v)} (${extenso(v)})`;

// ── Sugestões automáticas (editáveis no formulário até a integração com o Simulador) ──

const FORMA_PAGAMENTO: Record<string, string> = {
  'À vista': 'à vista',
  'Financiamento direto': 'por financiamento direto',
  'Financiamento bancário': 'por financiamento bancário',
};

export function sugestaoPrecoCondicoes(preco: number | null | undefined, formaPagamento: string): string {
  const forma = FORMA_PAGAMENTO[formaPagamento] || '';
  if (preco && preco > 0) {
    return `Preço de ${valorPorExtenso(preco)}${forma ? `, com pagamento ${forma}` : ''}.`;
  }
  return forma ? `Pagamento ${forma}.` : '';
}

// Honorários de 5% sobre o preço, como no Simulador (comissão base com corretor).
export const PERCENTUAL_CORRETAGEM = 0.05;

export function sugestaoCorretagem(
  temIntermediacao: boolean,
  beneficiario: string,
  preco: number | null | undefined
): string {
  if (!temIntermediacao) return SEM_INTERMEDIACAO;
  const nome = beneficiario.trim();
  if (preco && preco > 0) {
    const valor = Math.round(preco * PERCENTUAL_CORRETAGEM * 100) / 100;
    return `${valorPorExtenso(valor)} em favor de ${nome || '(beneficiário)'}.`;
  }
  return nome ? `Em favor de ${nome}.` : '';
}

type Detalhe = { area: number; matricula: number };
const DETALHES = detalhes as Record<string, Detalhe>;

// ── Montagem dos campos do Quadro Resumo ──

const fmtArea = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMatricula = (n: number) => n.toLocaleString('pt-BR');

export function imovelObjeto(numero: string, metragem?: number | null): string {
  const d = DETALHES[numero];
  const area = d?.area ?? metragem ?? null;
  let txt = `Lote nº ${numero} do Loteamento Residencial Erico Verissimo – Fase 2, em Cruz Alta/RS`;
  if (area) txt += `, com área de ${fmtArea(area)} m²`;
  if (d?.matricula) txt += `, objeto da matrícula nº ${fmtMatricula(d.matricula)} do Registro de Imóveis de Cruz Alta/RS`;
  return txt + '.';
}

export type Pessoa = {
  nome: string;
  nacionalidade: string;
  sexo: string;
  dataNascimento: string; // AAAA-MM-DD
  estadoCivil?: string;
  regimeBens?: string;
  profissao: string;
  cpf: string;
  documento: string;
  orgaoExpedidor: string;
  dataExpedicao: string; // AAAA-MM-DD
  email: string;
  telefone: string;
  endereco: string;
  cidade?: string;
};

const dataBR = (iso: string) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};

const NACIONALIDADE: Record<string, [string, string]> = {
  brasileira: ['brasileiro', 'brasileira'],
  argentina: ['argentino', 'argentina'],
  uruguaia: ['uruguaio', 'uruguaia'],
};

// Qualificação no formato do Simulador de Vendas (src/Contrato.tsx), flexionada pelo sexo.
export function qualificar(p: Pessoa): string {
  const fem = /^f/i.test(p.sexo || '');
  const masc = /^m/i.test(p.sexo || '');
  const g = (m: string, f: string, ambos: string) => (fem ? f : masc ? m : ambos);
  const partes: string[] = [];

  if (p.nome.trim()) partes.push(p.nome.trim().toUpperCase());
  const nac = NACIONALIDADE[(p.nacionalidade || '').trim().toLowerCase()];
  if (nac) partes.push(g(nac[0], nac[1], `${nac[0]}(a)`));
  else if (p.nacionalidade && !/^outro$/i.test(p.nacionalidade)) partes.push(p.nacionalidade.toLowerCase());
  if (p.dataNascimento) partes.push(`${g('nascido', 'nascida', 'nascido(a)')} em ${dataBR(p.dataNascimento)}`);

  if (p.estadoCivil) {
    const base = p.estadoCivil.replace(/\(a\)/i, '').trim().toLowerCase(); // casado, solteiro, divorciado, viúvo, união estável
    let ec: string;
    if (base === 'união estável') ec = 'convivente em união estável';
    else ec = g(base.replace(/a$/, 'o'), base.replace(/o$/, 'a'), `${base}(a)`);
    const regime = (p.regimeBens || '').trim();
    if (regime && !/não aplicável/i.test(regime) && /casad|união/i.test(base)) {
      ec += ` sob o regime de ${regime.toLowerCase()}`;
    }
    partes.push(ec);
  }

  if (p.profissao) partes.push(p.profissao.toLowerCase());
  if (p.cpf) partes.push(`${g('inscrito', 'inscrita', 'inscrito(a)')} no CPF sob nº ${p.cpf}`);
  if (p.documento) {
    let doc = `documento de identidade nº ${p.documento}`;
    if (p.orgaoExpedidor) doc += `, expedido pelo(a) ${p.orgaoExpedidor}`;
    if (p.dataExpedicao) doc += ` em ${dataBR(p.dataExpedicao)}`;
    partes.push(doc);
  }
  if (p.email) partes.push(`e-mail ${p.email}`);
  if (p.telefone) partes.push(`telefone ${p.telefone}`);
  const local = [p.endereco, p.cidade].filter(s => s && s.trim()).join(', ');
  if (local) partes.push(`${g('residente e domiciliado', 'residente e domiciliada', 'residente e domiciliado(a)')} na ${local}`);
  return partes.join(', ') + '.';
}

export function dataPorExtenso(d = new Date()): string {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ── Gerador do PDF ──

export type DadosArras = {
  outorgante: string;
  imovelObjeto: string;
  outorgados: string[]; // qualificações
  nomesOutorgados: string[];
  valorArras: string;
  precoCondicoes: string;
  corretagem: string;
};

type Seg = { t: string; b?: boolean };

const A4 = { w: 595.28, h: 841.89 };
const M = { l: 56, r: 56, t: 52, b: 52 };
const LARG = A4.w - M.l - M.r;
const PRETO = rgb(0, 0, 0);
const CINZA = rgb(0.35, 0.35, 0.35);

// Largura sem kerning: o pdf-lib mede com kerning mas desenha sem, o que
// apertava palavras como "OITAVA" e "QUARTA" contra a seguinte.
function larg(f: PDFFont, t: string, size: number): number {
  let w = 0;
  for (const ch of t) w += f.widthOfTextAtSize(ch, size);
  return w;
}

// Helvetica padrão só cobre WinAnsi: troca o que não couber para não quebrar o PDF.
function limpar(s: string): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[‐-‒―]/g, '-')
    .replace(/\t/g, ' ')
    .replace(/[^\n\x20-\x7E -ÿ–—“”•…€]/g, '');
}

export async function gerarArrasPdf(d: DadosArras): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Termo de Outorga de Direito de Preferência');
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M.t;
  const novaPagina = () => { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M.t; };
  const garantir = (h: number) => { if (y - h < M.b) novaPagina(); };

  // Quebra segmentos (com negrito) em linhas. Uma "palavra" pode ter partes em fontes
  // diferentes coladas (ex.: "OUTORGADA" em negrito + "," normal), para não abrir
  // espaço antes da pontuação. Linha que fecha um bloco (\n) não é justificada.
  type Parte = { t: string; f: PDFFont; w: number };
  type Palavra = { partes: Parte[]; w: number };
  type Linha = { palavras: Palavra[]; fimBloco: boolean };
  function quebrar(segs: Seg[], size: number, largura: number): Linha[] {
    const linhas: Linha[] = [];
    let atual: Palavra[] = [];
    let w = 0;
    let colar = false; // próxima parte gruda na palavra anterior
    const espaco = larg(reg, ' ', size);
    const fechar = (fimBloco: boolean) => { linhas.push({ palavras: atual, fimBloco }); atual = []; w = 0; };
    for (const s of segs) {
      const f = s.b ? bold : reg;
      const blocos = limpar(s.t).split('\n');
      blocos.forEach((bloco, bi) => {
        if (bi > 0) { fechar(true); colar = false; }
        if (/^\s/.test(bloco)) colar = false;
        for (const t of bloco.split(' ').filter(Boolean)) {
          const parte = { t, f, w: larg(f, t, size) };
          const ultima = atual[atual.length - 1];
          if (colar && ultima) {
            ultima.partes.push(parte);
            ultima.w += parte.w;
            w += parte.w;
            if (w > largura && atual.length > 1) { atual.pop(); fechar(false); atual.push(ultima); w = ultima.w; }
          } else {
            if (atual.length && w + espaco + parte.w > largura) fechar(false);
            w += (atual.length ? espaco : 0) + parte.w;
            atual.push({ partes: [parte], w: parte.w });
          }
          colar = false;
        }
        colar = bloco.length > 0 && !/\s$/.test(bloco);
      });
    }
    if (atual.length) fechar(true);
    return linhas;
  }

  function desenharLinhas(linhas: Linha[], x: number, size: number, lh: number, largura: number, justificar: boolean, centro = false) {
    const espacoBase = larg(reg, ' ', size);
    linhas.forEach(ln => {
      garantir(lh);
      const ps = ln.palavras;
      const total = ps.reduce((s, p) => s + p.w, 0);
      const gap = justificar && !ln.fimBloco && ps.length > 1 ? (largura - total) / (ps.length - 1) : espacoBase;
      let cx = centro ? x + (largura - (total + espacoBase * (ps.length - 1))) / 2 : x;
      for (const p of ps) {
        let px = cx;
        for (const pt of p.partes) {
          page.drawText(pt.t, { x: px, y: y - size, size, font: pt.f, color: PRETO });
          px += pt.w;
        }
        cx += p.w + gap;
      }
      y -= lh;
    });
  }

  function paragrafo(segs: Seg[], opts: { size?: number; antes?: number; centro?: boolean; justificar?: boolean } = {}) {
    const size = opts.size ?? 9;
    y -= opts.antes ?? 5;
    desenharLinhas(quebrar(segs, size, LARG), M.l, size, size * 1.32, LARG, opts.justificar ?? !opts.centro, opts.centro);
  }

  // Cabeçalho
  paragrafo([{ t: 'TERMO DE OUTORGA DE DIREITO DE PREFERÊNCIA PARA AQUISIÇÃO DE LOTE', b: true }], { size: 12, antes: 0, centro: true });
  paragrafo([{ t: 'LOTEAMENTO RESIDENCIAL ERICO VERISSIMO', b: true }], { size: 10, antes: 3, centro: true });
  paragrafo([{ t: 'QUADRO RESUMO', b: true }], { size: 9.5, antes: 8, centro: true });
  y -= 4;

  // Quadro Resumo (tabela com altura dinâmica)
  const COL1 = 128;
  const PAD = 4;
  const TS = 8.4;
  const TLH = TS * 1.3;
  const linhasQuadro: [string, string][] = [
    ['1. Outorgante:', d.outorgante],
    ['2. Imóvel objeto:', d.imovelObjeto],
    ['3. Outorgado:', d.outorgados.join('\n')],
    ['4. Valor do Arras:', d.valorArras],
    ['5. Preço e Condições:', d.precoCondicoes],
    ['6. Valor da Corretagem e beneficiário:', d.corretagem],
    ['7. Consequências da rescisão contratual:', 'Perda do valor pago a título de Arras, em função do inadimplemento.'],
    ['8. Arrependimento:', 'Este contrato é pactuado e assinado pelas partes na sede da Outorgante, no endereço indicado no Campo 1, não aplicando-se portanto o previsto no art. 49 da lei nº 8.078/90.'],
  ];
  for (const [rot, val] of linhasQuadro) {
    const lRot = quebrar([{ t: rot, b: true }], TS, COL1 - PAD * 2);
    const lVal = quebrar([{ t: val || '-' }], TS, LARG - COL1 - PAD * 2);
    const h = Math.max(lRot.length, lVal.length) * TLH + PAD * 2;
    garantir(h);
    const topo = y;
    page.drawRectangle({ x: M.l, y: topo - h, width: LARG, height: h, borderColor: PRETO, borderWidth: 0.6 });
    page.drawLine({ start: { x: M.l + COL1, y: topo }, end: { x: M.l + COL1, y: topo - h }, thickness: 0.6, color: PRETO });
    y = topo - PAD;
    desenharLinhas(lRot, M.l + PAD, TS, TLH, COL1 - PAD * 2, false);
    y = topo - PAD;
    desenharLinhas(lVal, M.l + COL1 + PAD, TS, TLH, LARG - COL1 - PAD * 2, true);
    y = topo - h;
  }

  const B = (t: string): Seg => ({ t, b: true });
  const N = (t: string): Seg => ({ t });

  paragrafo([N('Pelo presente instrumento e na melhor forma de direito, as “Partes”, indicadas nos itens 1 e 2 do Quadro Resumo têm, entre si, justo e acertado, o presente Termo de Preferência, que se regerá pelas cláusulas e condições abaixo dispostas.')], { antes: 10 });
  paragrafo([B('CONSIDERANDO QUE:')], { antes: 7 });
  paragrafo([N('a) A '), B('OUTORGANTE'), N(' é proprietária e legítima possuidora de imóvel situado no Loteamento fruto de parcelamento de solo do todo maior representado pela matrícula nº 52.037 do Livro 2 – RG do Registro de Imóveis de Cruz Alta, representado pelo Lote Indicado no Campo 02 do Quadro Resumo;')]);
  paragrafo([N('b) A '), B('OUTORGADA'), N(' possui interesse na preferência para aquisição do Imóvel por preço e condições vantajosas, conforme definido neste instrumento; e')]);
  paragrafo([B('RESOLVEM'), N(' celebrar o presente '), B('TERMO DE OUTORGA DE DIREITO DE PREFERÊNCIA PARA AQUISIÇÃO DE IMÓVEL'), N(' (o “'), B('Termo de Preferência'), N('” ou “'), B('Instrumento'), N('”), que se regerá pelas cláusulas e condições seguintes:')]);

  paragrafo([B('CLÁUSULA PRIMEIRA:'), N(' Fica estabelecido como objeto deste instrumento a outorga, pela '), B('OUTORGANTE'), N(' à '), B('OUTORGADA'), N(', do direito de preferência, nas condições citadas no Quadro Resumo, pelo prazo de 15 (quinze) dias após a data de assinatura do presente Termo, concomitante ao lançamento comercial do empreendimento denominado Loteamento Residencial Erico Verissimo, devidamente registrado no Cartório do Registro de Imóveis de Cruz Alta sob o nº R.5/52.037, para aquisição do '), B('Imóvel'), N(' e consequente assinatura do respectivo contrato definitivo, o qual será garantido por alienação fiduciária, regida pela Lei 9.514/97.')], { antes: 8 });
  paragrafo([B('Parágrafo Primeiro:'), N(' A '), B('OUTORGANTE'), N(' declara que, exceto em função de registro de hipoteca em favor de Prefeitura Municipal de Cruz Alta, em função da realização de execução das obras para a regular implementação do loteamento, as quais o '), B('OUTORGADO'), N(' desde já manifesta sua anuência expressa, o '), B('Imóvel'), N(' será entregue livre e desembaraçado de quaisquer ônus, gravames ou restrições legais, judiciais ou consensuais e quites com os impostos e taxas incidentes.')]);
  paragrafo([B('Parágrafo Segundo:'), N(' A relação jurídica estabelecida entre '), B('OUTORGANTE'), N(' e '), B('OUTORGADO'), N(' será regida pelas cláusulas e condições gerais do presente Termo de Preferência e, posteriormente, adquirirá status de contrato definitivo quando da assinatura do contrato-padrão registrado no R.I. juntamente ao processo de parcelamento de solo, sob nº R.5/52.037, exceto se diferentemente estipulado entre as Partes e, uma vez firmes e ajustadas, declara-se o OUTORGADO integralmente de acordo, e cuja recusa ensejará na perda do direito adquirido sem direito à restituição dos valores, com a consequente perda do valor pago a título de arras.')]);
  paragrafo([B('CLÁUSULA SEGUNDA:'), N(' Assim, durante o período de vigência do presente instrumento, a '), B('OUTORGANTE'), N(' se obriga perante à '), B('OUTORGADA'), N(' a não vender, ceder, gravar, onerar, prometer à venda ou de qualquer forma alienar o '), B('Imóvel'), N(' a terceiros, sem antes observar o quanto disposto neste '), B('Termo de Preferência'), N('.')], { antes: 8 });
  paragrafo([B('Parágrafo Primeiro:'), N(' Deverá a '), B('OUTORGADA'), N(' dirigir-se à '), B('OUTORGANTE'), N(' para, se assim optar, exercer seu Direito de Preferência, dentro do prazo estabelecido.')]);
  paragrafo([B('Parágrafo Segundo:'), N(' Uma vez não exercido o Direito de Preferência no prazo estabelecido, na forma deste instrumento, fica a '), B('OUTORGADA'), N(' sujeita aos efeitos legais da rescisão contratual, incluindo a perda dos valores pagos a título de Arras.')]);
  paragrafo([B('CLÁUSULA TERCEIRA:'), N(' Como condição de outorga do Direito de Preferência de que trata este instrumento, a OUTORGADA pagará, em favor da OUTORGANTE, a título de arras, o valor previsto no Campo 04 do Quadro Resumo, pelo que poderá ela – OUTORGADA – exercer seu direito de compra nas condições promocionais de lançamento.')], { antes: 8 });
  paragrafo([B('CLÁUSULA QUARTA:'), N(' Uma vez exercido o Direito de Preferência pela '), B('OUTORGADA'), N(' dentro do prazo estipulado neste instrumento, o valor pago a título de arras será abatido do preço do Imóvel e, de outro lado, caso não exercido, perderá ela – '), B('OUTORGADA'), N(' – em favor da '), B('OUTORGANTE'), N(' o valor pago a título de arras, nada podendo reclamar a título de reembolso e, de igual forma, nada poderá ser dela exigido, como indenização suplementar.')], { antes: 8 });
  paragrafo([B('Parágrafo Primeiro:'), N(' Após a resolução do direito de preferência em função de seu não exercício, poderá a '), B('OUTORGADA'), N(' adquirir o Imóvel, desde que observe a política comercial vigente à época da nova contratação.')]);
  paragrafo([B('CLÁUSULA QUINTA:'), N(' Todas as comunicações relativas ou para os fins desse instrumento, far-se-ão necessariamente por escrito e serão entregues de uma parte à outra por e-mail, pessoalmente e sob protocolo ou qualquer outro meio com comprovação de envio e recebimento, ficando investidos de poderes para receber tais comunicações ou quaisquer notificações, para os endereços eletrônicos indicados no Quadro Resumo.')], { antes: 8 });
  paragrafo([B('Parágrafo Primeiro:'), N(' As notificações e comunicações que envolvam situações sujeitas a prazos serão consideradas tempestivas desde que realizadas conforme disposto no caput e alíneas desta cláusula, ainda que, neste caso, sejam efetivamente recebidas/entregues à outra parte após o escoamento do prazo.')]);
  paragrafo([B('Parágrafo Segundo:'), N(' As Partes obrigam-se, uma frente à outra, a comunicar formalmente toda e qualquer alteração de seu endereço, sob pena de considerar-se válida e eficaz qualquer comunicação, intimação ou notificação feita nos endereços antes indicados.')]);
  paragrafo([B('CLÁUSULA SEXTA:'), N(' Os direitos e as obrigações decorrentes deste instrumento não poderão ser cedidos pela '), B('OUTORGADA'), N(' a terceiros, exceto com a anuência da '), B('OUTORGANTE'), N('.')], { antes: 8 });
  paragrafo([B('CLÁUSULA SÉTIMA:'), N(' O presente instrumento é celebrado em caráter irrevogável e irretratável, sendo obrigatório às Partes, seus herdeiros ou sucessores a qualquer título.')], { antes: 8 });
  paragrafo([B('CLÁUSULA OITAVA:'), N(' As Partes elegem o Foro da Comarca de Cruz Alta/RS, como o competente para dirimir qualquer conflito decorrente e/ou relativo ao presente Instrumento.')], { antes: 8 });
  // O fecho vai junto com as assinaturas (nunca uma página só de assinaturas).
  const nomes = d.nomesOutorgados.filter(Boolean).length ? d.nomesOutorgados.filter(Boolean) : [''];
  const altura = 26 + Math.max(nomes.length, 1) * 34 + 56;
  garantir(altura + 16 + 34 + 30);
  paragrafo([N('E, por estarem assim justos e contratados, celebram o presente Instrumento, em 02 (duas) vias de igual teor e forma, na presença das testemunhas signatárias.')], { antes: 8 });

  // Assinaturas (bloco inteiro na mesma página)
  garantir(altura + 16);
  paragrafo([N(`Cruz Alta/RS, ${dataPorExtenso()}.`)], { antes: 12, justificar: false });
  y -= 26;

  const colW = (LARG - 30) / 2;
  const xEsq = M.l;
  const xDir = M.l + colW + 30;
  const assinatura = (x: number, yy: number, linha1: string, linha2?: string) => {
    page.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 0.6, color: PRETO });
    const t1 = limpar(linha1);
    const w1 = larg(bold, t1, 8);
    page.drawText(t1, { x: x + (colW - w1) / 2, y: yy - 11, size: 8, font: bold, color: PRETO });
    if (linha2) {
      const t2 = limpar(linha2);
      const w2 = larg(reg, t2, 7.5);
      page.drawText(t2, { x: x + (colW - w2) / 2, y: yy - 21, size: 7.5, font: reg, color: CINZA });
    }
  };

  let yAss = y;
  nomes.forEach((nome, i) => {
    assinatura(xEsq, yAss - i * 34, nome || 'Outorgado(a)', 'Outorgado(a)');
  });
  assinatura(xDir, yAss, 'CAY EMPREENDIMENTOS IMOBILIÁRIOS SPE LTDA', 'Outorgante');
  yAss -= Math.max(nomes.length, 1) * 34 + 20;

  const testemunha = (x: number) => {
    page.drawLine({ start: { x, y: yAss }, end: { x: x + colW, y: yAss }, thickness: 0.6, color: PRETO });
    page.drawText('Testemunha', { x, y: yAss - 11, size: 8, font: bold, color: PRETO });
    page.drawText('Nome:', { x, y: yAss - 22, size: 7.5, font: reg, color: CINZA });
    page.drawText('CPF:', { x, y: yAss - 32, size: 7.5, font: reg, color: CINZA });
  };
  testemunha(xEsq);
  testemunha(xDir);

  // Rodapé com numeração
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const t = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(t, { x: A4.w - M.r - larg(reg, t, 7.5), y: 28, size: 7.5, font: reg, color: CINZA });
  });

  return pdf.save();
}
