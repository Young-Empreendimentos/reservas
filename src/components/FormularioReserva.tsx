'use client';

import { useState } from 'react';
import type { Lote } from '@/src/data/lotes';
import {
  gerarArrasPdf,
  imovelObjeto,
  qualificar,
  sugestaoCorretagem,
  sugestaoPrecoCondicoes,
  VALOR_ARRAS_TEXTO
} from '@/src/lib/arras';
import { db, FUNCAO_ANEXOS, mensagemErro, supabase } from '@/src/lib/supabase';

// Campos da reserva (snake_case no banco) -> campos do formulário.
const DO_BANCO: Record<string, string> = {
  nome: 'nome', escolaridade: 'escolaridade', nacionalidade: 'nacionalidade', sexo: 'sexo',
  estado_civil: 'estadoCivil', data_casamento: 'dataCasamento', regime_bens: 'regimeBens',
  profissao: 'profissao', data_nascimento: 'dataNascimento', cpf: 'cpf', rg_cnh: 'rgCnh',
  orgao_expedidor: 'orgaoExpedidor', data_expedicao: 'dataExpedicao', endereco: 'endereco',
  cidade: 'cidade', email: 'email', telefone: 'telefone',
  nome_secundario: 'nomeSecundario', nacionalidade_secundario: 'nacionalidadeSecundario',
  sexo_secundario: 'sexoSecundario', data_nascimento_secundario: 'dataNascimentoSecundario',
  cpf_secundario: 'cpfSecundario', rg_cnh_secundario: 'rgCnhSecundario',
  orgao_expedidor_secundario: 'orgaoExpedidorSecundario',
  data_expedicao_secundario: 'dataExpedicaoSecundario', empresa_secundario: 'empresaSecundario',
  profissao_secundario: 'profissaoSecundario', endereco_secundario: 'enderecoSecundario',
  email_secundario: 'emailSecundario', telefone_secundario: 'telefoneSecundario',
  tipo_residencia: 'tipoResidencia', tempo_residencia: 'tempoResidencia',
  renda_familiar: 'rendaFamiliar', filhos: 'filhos', forma_pagamento: 'formaPagamento',
  motivo_compra: 'motivoCompra', quantidade_terrenos: 'quantidadeTerrenos',
  recomendacao: 'recomendacao', origem: 'origem'
};

const INTERMEDIACAO_YOUNG = 'Young';
const INTERMEDIACAO_PARCEIRO = 'Corretor parceiro / Imobiliária';
const intermediacoes = [INTERMEDIACAO_YOUNG, INTERMEDIACAO_PARCEIRO];

const responsaveis = ['Helen Cardoso','Joana Mantovane','Matheus Padilha','RG Imóveis','Aline Imóveis','Victor Bortoluzzi','Mastercruz Imobiliária','Imobiliária Cruz Alta','Valdair Didone','Domingos Imóveis','Simone - Di Bento Imóveis','Távola Imobiliária','Erthal Imóveis','Imobiliária Profit','Pedro Mariano Imóveis','Premium Imóveis','Lamaison Imóveis','Rodrigo Schimidt','Mariana Baumhardt','Personal Imoveis','Matheus Vargas'];

const interests = ['Animais de estimação','Automóveis','Casa e decoração','Ciências/Tecnologia','Cinema/Televisão/Jornalismo','Educação/Cultura','Esportes/Fitness/Saúde','Finanças/Economia','Gastronomia/Culinária','Negócios/Empreendedorismo','Política/Relações Públicas','Viagens/Turismo'];

export default function FormularioReserva({
  lote,
  onClose,
  onSuccess
}: {
  lote: Lote;
  onClose: () => void;
  onSuccess: (mensagem: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [secondary, setSecondary] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({
    intermediacao: '',
    responsavelReserva: '',
    nome: '',
    escolaridade: '',
    nacionalidade: 'Brasileira',
    sexo: '',
    estadoCivil: '',
    dataCasamento: '',
    regimeBens: '',
    profissao: '',
    dataNascimento: '',
    cpf: '',
    rgCnh: '',
    orgaoExpedidor: '',
    dataExpedicao: '',
    endereco: '',
    cidade: 'Cruz Alta/RS',
    email: '',
    telefone: '',

    nomeSecundario: '',
    nacionalidadeSecundario: 'Brasileira',
    sexoSecundario: '',
    dataNascimentoSecundario: '',
    cpfSecundario: '',
    rgCnhSecundario: '',
    orgaoExpedidorSecundario: '',
    dataExpedicaoSecundario: '',
    empresaSecundario: '',
    profissaoSecundario: '',
    enderecoSecundario: '',
    emailSecundario: '',
    telefoneSecundario: '',

    tipoResidencia: '',
    tempoResidencia: '',
    rendaFamiliar: '',
    filhos: '',
    formaPagamento: '',
    motivoCompra: '',
    quantidadeTerrenos: '1',
    recomendacao: '',
    origem: '',
    observacoes: '',

    valorArras: VALOR_ARRAS_TEXTO,
    precoCondicoes: '',
    valorCorretagemBeneficiario: ''
  });

  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, File | null>>({});

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Preenche pelo CPF: última reserva com esse CPF (banco) ou cadastro do Sienge.
  async function buscarClientePorCpf(cpf: string) {
    if (cpf.replace(/\D/g, '').length !== 11) return;

    const { data, error } = await db.rpc('reservas_buscar_cliente', { p_cpf: cpf });
    if (error || !data) return;

    const origem = (data.reserva || data.sienge || {}) as Record<string, unknown>;
    const novos: Record<string, string> = {};
    for (const [col, campo] of Object.entries(DO_BANCO)) {
      const v = origem[col];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        novos[campo] = /^data_/.test(col) ? String(v).slice(0, 10) : String(v);
      }
    }
    setForm(prev => ({ ...prev, ...novos, cpf: prev.cpf }));

    const interesses = data.reserva?.interesses;
    if (Array.isArray(interesses) && interesses.length) setSelectedInterests(interesses as string[]);
    if (novos.nomeSecundario) setSecondary(true);
  }

  // Preço/condições e corretagem: sugestão automática com o que já se sabe
  // (preço do lote na planilha, forma de pagamento, intermediação e responsável).
  // Editável; se a pessoa mexer, vale o texto dela. Depois virá do Simulador de Vendas.
  const [editado, setEditado] = useState({ preco: false, corretagem: false });
  const temIntermediacao = form.intermediacao === INTERMEDIACAO_PARCEIRO;
  const autoPreco = sugestaoPrecoCondicoes(lote.preco, form.formaPagamento);
  const autoCorretagem = sugestaoCorretagem(temIntermediacao, form.responsavelReserva, lote.preco);
  const precoCondicoes = editado.preco ? form.precoCondicoes : autoPreco;
  const corretagem = editado.corretagem ? form.valorCorretagemBeneficiario : autoCorretagem;

  function editarCampo(campo: 'preco' | 'corretagem', key: string, value: string) {
    setField(key, value);
    setEditado(prev => ({ ...prev, [campo]: true }));
  }

  function camposArras() {
    const titular = qualificar({
      nome: form.nome,
      nacionalidade: form.nacionalidade,
      sexo: form.sexo,
      dataNascimento: form.dataNascimento,
      estadoCivil: form.estadoCivil,
      regimeBens: form.regimeBens,
      profissao: form.profissao,
      cpf: form.cpf,
      documento: form.rgCnh,
      orgaoExpedidor: form.orgaoExpedidor,
      dataExpedicao: form.dataExpedicao,
      email: form.email,
      telefone: form.telefone,
      endereco: form.endereco,
      cidade: form.cidade
    });

    const temSegundo = secondary && form.nomeSecundario.trim() !== '';
    const segundo = temSegundo
      ? qualificar({
          nome: form.nomeSecundario,
          nacionalidade: form.nacionalidadeSecundario,
          sexo: form.sexoSecundario,
          dataNascimento: form.dataNascimentoSecundario,
          profissao: form.profissaoSecundario,
          cpf: form.cpfSecundario,
          documento: form.rgCnhSecundario,
          orgaoExpedidor: form.orgaoExpedidorSecundario,
          dataExpedicao: form.dataExpedicaoSecundario,
          email: form.emailSecundario,
          telefone: form.telefoneSecundario,
          endereco: form.enderecoSecundario
        })
      : '';

    return {
      imovelObjeto: imovelObjeto(lote.numero, lote.metragem),
      outorgados: segundo ? [titular, segundo] : [titular],
      nomesOutorgados: temSegundo
        ? [form.nome, form.nomeSecundario]
        : [form.nome],
      valorArras: VALOR_ARRAS_TEXTO,
      precoCondicoes,
      corretagem
    };
  }

  async function gerarPDF() {
    try {
      // Qualificação do Outorgante fica no banco (dado pessoal, fora do código).
      const { data: cfg, error: errCfg } = await db
        .from('reservas_config')
        .select('valor')
        .eq('chave', 'outorgante')
        .single();
      if (errCfg || !cfg) throw new Error('Texto do Outorgante não encontrado.');

      const pdfBytes = await gerarArrasPdf({ ...camposArras(), outorgante: cfg.valor as string });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `termo-outorga-lote-${lote.numero}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      setError('Não foi possível gerar o PDF.');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      // 1) Reserva atômica no banco (trava o lote e confere disponibilidade).
      const { data: reservaId, error: erroReserva } = await db.rpc('reservar_lote', {
        p_lote: lote.numero,
        p_dados: {
          ...form,
          valorArras: VALOR_ARRAS_TEXTO,
          precoCondicoes,
          valorCorretagemBeneficiario: corretagem,
          imovelObjeto: imovelObjeto(lote.numero, lote.metragem),
          interesses: selectedInterests
        }
      });
      if (erroReserva) throw erroReserva;

      // 2) Anexos vão para o Drive por uma função do servidor (o endereço do Drive não fica no site).
      const anexos = Object.entries(files).filter(([, f]) => f) as [string, File][];
      if (anexos.length) {
        const fd = new FormData();
        fd.append('reserva_id', String(reservaId));
        anexos.forEach(([k, f]) => fd.append(k, f));
        const { error: erroAnexos } = await supabase.functions.invoke(FUNCAO_ANEXOS, { body: fd });
        if (erroAnexos) {
          onSuccess(`Lote ${lote.numero} reservado, mas os anexos não foram enviados (${mensagemErro(erroAnexos)}). Envie-os novamente pela aba de reservas.`);
          return;
        }
      }

      onSuccess(`Lote ${lote.numero} reservado com sucesso.`);
    } catch (e) {
      setError(mensagemErro(e) || 'Erro ao enviar a reserva.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="reservation-modal">

        <div className="reservation-header">
          <div>
            <div className="modal-kicker">Ficha de reserva</div>
            <h2 className="modal-title">Lote {lote.numero}</h2>
          </div>

          <button
            className="close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={submit}
          className="reservation-form"
        >

          <div className="form-section">
            <h3>Reserva</h3>

            <div className="form-grid">
              <Field label="Intermediação">
                <select
                  required
                  value={form.intermediacao}
                  onChange={e =>
                    setField('intermediacao', e.target.value)
                  }
                >
                  <option value="">Selecione</option>

                  {intermediacoes.map(x => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>

              <Field label="Responsável pela reserva">
                <select
                  required
                  value={form.responsavelReserva}
                  onChange={e =>
                    setField(
                      'responsavelReserva',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>

                  {responsaveis.map(x => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="form-section">
            <h3>Dados do comprador (titular)</h3>

            <div className="form-grid">

              <Field label="Nome completo" full>
                <input
                  required
                  value={form.nome}
                  onChange={e =>
                    setField('nome', e.target.value)
                  }
                />
              </Field>

              <Field label="Nível de escolaridade">
                <select
                  required
                  value={form.escolaridade}
                  onChange={e =>
                    setField(
                      'escolaridade',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Ensino fundamental completo</option>
                  <option>Ensino médio completo</option>
                  <option>Ensino superior completo</option>
                  <option>Graduação</option>
                  <option>Pós Graduação</option>
                  <option>Mestrado</option>
                  <option>Doutorado</option>
                  <option>Pós doutorado</option>
                </select>
              </Field>

              <Field label="Nacionalidade">
                <select
                  value={form.nacionalidade}
                  onChange={e =>
                    setField(
                      'nacionalidade',
                      e.target.value
                    )
                  }
                >
                  <option>Brasileira</option>
                  <option>Argentina</option>
                  <option>Uruguaia</option>
                  <option>Outro</option>
                </select>
              </Field>

              <Field label="Sexo">
                <select
                  required
                  value={form.sexo}
                  onChange={e =>
                    setField('sexo', e.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option>Feminino</option>
                  <option>Masculino</option>
                </select>
              </Field>

              <Field label="Estado civil">
                <select
                  required
                  value={form.estadoCivil}
                  onChange={e =>
                    setField(
                      'estadoCivil',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Casado(a)</option>
                  <option>Solteiro(a)</option>
                  <option>União estável</option>
                  <option>Divorciado(a)</option>
                  <option>Viúvo(a)</option>
                </select>
              </Field>

              <Field label="Regime de bens">
                <select
                  required
                  value={form.regimeBens}
                  onChange={e =>
                    setField(
                      'regimeBens',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Comunhão parcial de bens</option>
                  <option>Comunhão universal de bens</option>
                  <option>Separação total de bens</option>
                  <option>Não aplicável</option>
                </select>
              </Field>

              <Field label="Data do casamento">
                <input
                  type="date"
                  value={form.dataCasamento}
                  onChange={e =>
                    setField(
                      'dataCasamento',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="Profissão">
                <input
                  required
                  value={form.profissao}
                  onChange={e =>
                    setField(
                      'profissao',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="Data de nascimento">
                <input
                  required
                  type="date"
                  value={form.dataNascimento}
                  onChange={e =>
                    setField(
                      'dataNascimento',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="CPF">
                <input
                  required
                  inputMode="numeric"
                  value={form.cpf}
                  onChange={e =>
                    setField('cpf', e.target.value)
                  }
                  onBlur={e =>
                    buscarClientePorCpf(e.target.value)
                  }
                />
              </Field>

              <Field label="RG ou CNH">
                <input
                  required
                  value={form.rgCnh}
                  onChange={e =>
                    setField('rgCnh', e.target.value)
                  }
                />
              </Field>

              <Field label="Órgão expedidor">
                <input
                  required
                  value={form.orgaoExpedidor}
                  onChange={e =>
                    setField(
                      'orgaoExpedidor',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="Data de expedição">
                <input
                  required
                  type="date"
                  value={form.dataExpedicao}
                  onChange={e =>
                    setField(
                      'dataExpedicao',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="Endereço completo" full>
                <input
                  required
                  value={form.endereco}
                  onChange={e =>
                    setField(
                      'endereco',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="Residência atual - Cidade">
                <input
                  required
                  value={form.cidade}
                  onChange={e =>
                    setField(
                      'cidade',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="E-mail">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e =>
                    setField(
                      'email',
                      e.target.value
                    )
                  }
                />
              </Field>

              <Field label="Telefone">
                <input
                  required
                  value={form.telefone}
                  onChange={e =>
                    setField(
                      'telefone',
                      e.target.value
                    )
                  }
                />
              </Field>

            </div>
          </div>

          <div className="form-section">

            <div className="section-row">
              <h3>Dados do cônjuge ou segundo comprador</h3>

              <label className="switch">
                <input
                  type="checkbox"
                  checked={secondary}
                  onChange={e =>
                    setSecondary(e.target.checked)
                  }
                />
                <span>Incluir</span>
              </label>
            </div>

            {secondary && (
              <div className="form-grid">

                <Field label="Nome completo">
                  <input
                    value={form.nomeSecundario}
                    onChange={e =>
                      setField(
                        'nomeSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Nacionalidade">
                  <select
                    value={form.nacionalidadeSecundario}
                    onChange={e =>
                      setField(
                        'nacionalidadeSecundario',
                        e.target.value
                      )
                    }
                  >
                    <option>Brasileira</option>
                    <option>Argentina</option>
                    <option>Uruguaia</option>
                    <option>Outro</option>
                  </select>
                </Field>

                <Field label="Sexo">
                  <select
                    value={form.sexoSecundario}
                    onChange={e =>
                      setField(
                        'sexoSecundario',
                        e.target.value
                      )
                    }
                  >
                    <option value="">Selecione</option>
                    <option>Feminino</option>
                    <option>Masculino</option>
                  </select>
                </Field>

                <Field label="Data de nascimento">
                  <input
                    type="date"
                    value={form.dataNascimentoSecundario}
                    onChange={e =>
                      setField(
                        'dataNascimentoSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="CPF">
                  <input
                    value={form.cpfSecundario}
                    onChange={e =>
                      setField(
                        'cpfSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="RG ou CNH">
                  <input
                    value={form.rgCnhSecundario}
                    onChange={e =>
                      setField(
                        'rgCnhSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Órgão expedidor">
                  <input
                    value={form.orgaoExpedidorSecundario}
                    onChange={e =>
                      setField(
                        'orgaoExpedidorSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Data de expedição">
                  <input
                    type="date"
                    value={form.dataExpedicaoSecundario}
                    onChange={e =>
                      setField(
                        'dataExpedicaoSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Empresa">
                  <input
                    value={form.empresaSecundario}
                    onChange={e =>
                      setField(
                        'empresaSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Profissão">
                  <input
                    value={form.profissaoSecundario}
                    onChange={e =>
                      setField(
                        'profissaoSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Endereço completo" full>
                  <input
                    value={form.enderecoSecundario}
                    onChange={e =>
                      setField(
                        'enderecoSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="E-mail">
                  <input
                    type="email"
                    value={form.emailSecundario}
                    onChange={e =>
                      setField(
                        'emailSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Telefone">
                  <input
                    value={form.telefoneSecundario}
                    onChange={e =>
                      setField(
                        'telefoneSecundario',
                        e.target.value
                      )
                    }
                  />
                </Field>

              </div>
            )}
          </div>

          <div className="form-section">

            <h3>Sobre o cliente</h3>

            <div className="form-grid">

              <Field label="Tipo de Residência atual">
                <select
                  required
                  value={form.tipoResidencia}
                  onChange={e =>
                    setField(
                      'tipoResidencia',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Alugada</option>
                  <option>Própria financiada</option>
                  <option>Própria quitada</option>
                  <option>
                    Compartilhada (família, amigos, colegas, etc.)
                  </option>
                </select>
              </Field>

              <Field label="Tempo no Endereço atual">
                <select
                  required
                  value={form.tempoResidencia}
                  onChange={e =>
                    setField(
                      'tempoResidencia',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Menos de 1 ano</option>
                  <option>1 a 3 anos</option>
                  <option>3 a 5 anos</option>
                  <option>5 a 10 anos</option>
                  <option>Mais de 10 anos</option>
                </select>
              </Field>

              <Field label="Renda familiar mensal">
                <select
                  required
                  value={form.rendaFamiliar}
                  onChange={e =>
                    setField(
                      'rendaFamiliar',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Até 3 mil reais</option>
                  <option>3 a 5 mil reais</option>
                  <option>5 a 10 mil reais</option>
                  <option>10 a 15 mil reais</option>
                  <option>15 a 20 mil reais</option>
                  <option>Acima de 20 mil reais</option>
                </select>
              </Field>

              <Field label="Você tem filhos? Quantos">
                <select
                  required
                  value={form.filhos}
                  onChange={e =>
                    setField(
                      'filhos',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Não possuo</option>
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4 ou mais</option>
                </select>
              </Field>

            </div>

            <div className="interest-box">

              <div className="field-label">
                Principais interesses
              </div>

              <div className="interest-grid">

                {interests.map(item => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={selectedInterests.includes(item)}
                      onChange={e =>
                        setSelectedInterests(prev =>
                          e.target.checked
                            ? [...prev, item]
                            : prev.filter(x => x !== item)
                        )
                      }
                    />
                    {item}
                  </label>
                ))}

              </div>
            </div>
          </div>

          <div className="form-section">

            <h3>Empreendimento e forma de pagamento</h3>

            <div className="form-grid">

              <Field label="Forma de pagamento pretendida">
                <select
                  required
                  value={form.formaPagamento}
                  onChange={e =>
                    setField(
                      'formaPagamento',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>À vista</option>
                  <option>Financiamento direto</option>
                  <option>Financiamento bancário</option>
                </select>
              </Field>

              <Field label="Motivo principal da compra">
                <select
                  required
                  value={form.motivoCompra}
                  onChange={e =>
                    setField(
                      'motivoCompra',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Moradia</option>
                  <option>Comércio</option>
                  <option>Investimento</option>
                  <option>Presente/doação</option>
                </select>
              </Field>

              <Field label="Quantos terrenos está adquirindo">
                <select
                  required
                  value={form.quantidadeTerrenos}
                  onChange={e =>
                    setField(
                      'quantidadeTerrenos',
                      e.target.value
                    )
                  }
                >
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                  <option>5</option>
                  <option>6 ou mais</option>
                </select>
              </Field>

              <Field label="De 1 a 10, probabilidade de recomendar">
                <select
                  value={form.recomendacao}
                  onChange={e =>
                    setField(
                      'recomendacao',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>

                  {Array.from(
                    { length: 10 },
                    (_, i) => (
                      <option key={i + 1}>
                        {i + 1}
                      </option>
                    )
                  )}
                </select>
              </Field>

              <Field
                label="Como ficou sabendo do empreendimento"
                full
              >
                <select
                  required
                  value={form.origem}
                  onChange={e =>
                    setField(
                      'origem',
                      e.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option>Visita ao plantão de vendas</option>
                  <option>Site da empresa</option>
                  <option>Facebook</option>
                  <option>Instagram</option>
                  <option>Oferta do corretor</option>
                  <option>Passando em frente ao local</option>
                  <option>Indicação de amigo/cliente</option>
                  <option>Mídia impressa (revista, panfleto)</option>
                  <option>Carro de som</option>
                  <option>Evento de lançamento</option>
                  <option>Jornal</option>
                  <option>Outdoor</option>
                  <option>Painel Digital (LED)</option>
                  <option>Pesquisa no Google</option>
                  <option>Rádio</option>
                  <option>Sites de terceiros (OLX, Zap, etc.)</option>
                  <option>Tiktok</option>
                  <option>YouTube</option>
                </select>
              </Field>

              <Field
                label="Sugestões, elogios e reclamações"
                full
              >
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={e =>
                    setField(
                      'observacoes',
                      e.target.value
                    )
                  }
                />
              </Field>

            </div>
          </div>

          <div className="form-section">

            <h3>Termo de arras (Quadro Resumo)</h3>

            <div className="form-grid">

              <Field label="Imóvel objeto" full>
                <textarea
                  readOnly
                  rows={2}
                  value={imovelObjeto(lote.numero, lote.metragem)}
                />
              </Field>

              <Field label="Valor do Arras">
                <input readOnly value={VALOR_ARRAS_TEXTO} />
              </Field>

              <Field label="Preço e Condições" full>
                <textarea
                  required
                  rows={2}
                  value={precoCondicoes}
                  onChange={e =>
                    editarCampo('preco', 'precoCondicoes', e.target.value)
                  }
                  placeholder="Ex.: Preço total de R$ 180.000,00 (cento e oitenta mil reais), sendo entrada de R$ 18.000,00 e saldo em 120 parcelas mensais de R$ 1.350,00"
                />
                <AutoStatus
                  editado={editado.preco}
                  onRestaurar={() => setEditado(prev => ({ ...prev, preco: false }))}
                />
              </Field>

              <Field
                label="Valor da Corretagem e beneficiário"
                full
              >
                <textarea
                  required
                  rows={2}
                  value={corretagem}
                  onChange={e =>
                    editarCampo('corretagem', 'valorCorretagemBeneficiario', e.target.value)
                  }
                  placeholder="Ex.: R$ 9.000,00 (nove mil reais) em favor de NOME, inscrito no CPF/CNPJ sob o nº ..., CRECI ..., com endereço na ..., fone ..., e-mail ..."
                />
                <AutoStatus
                  editado={editado.corretagem}
                  onRestaurar={() => setEditado(prev => ({ ...prev, corretagem: false }))}
                />
              </Field>

            </div>

            <p className="field-hint">
              O Outorgado é preenchido com os dados do comprador acima. Preço e corretagem são
              sugeridos com os dados disponíveis (preço do lote, forma de pagamento, intermediação
              e responsável; corretagem de 5% como no Simulador) e podem ser editados. Depois virão
              do Simulador de Vendas.
            </p>
          </div>

          <div className="form-section">

            <h3>Anexos</h3>

            <div className="form-grid">

              <Field label="Documento do titular">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  required
                  onChange={e =>
                    setFiles(prev => ({
                      ...prev,
                      arquivo_titular:
                        e.target.files?.[0] || null
                    }))
                  }
                />
              </Field>

              <Field label="Documento do segundo comprador">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e =>
                    setFiles(prev => ({
                      ...prev,
                      arquivo_segundo_comprador:
                        e.target.files?.[0] || null
                    }))
                  }
                />
              </Field>

              <Field label="Comprovante de residência">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  required
                  onChange={e =>
                    setFiles(prev => ({
                      ...prev,
                      arquivo_comprovante_residencia:
                        e.target.files?.[0] || null
                    }))
                  }
                />
              </Field>

              <Field label="Comprovante de pagamento">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  required
                  onChange={e =>
                    setFiles(prev => ({
                      ...prev,
                      arquivo_comprovante_pagamento:
                        e.target.files?.[0] || null
                    }))
                  }
                />
              </Field>

            </div>
          </div>

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <div className="form-actions">

            <button
              type="button"
              className="secondary-button"
              onClick={gerarPDF}
            >
              Gerar PDF
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancelar
            </button>

            <button
              className="primary-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? 'Registrando reserva...'
                : `Confirmar reserva do lote ${lote.numero}`}
            </button>

          </div>

        </form>
      </div>
    </div>
  );
}

function AutoStatus({
  editado,
  onRestaurar
}: {
  editado: boolean;
  onRestaurar: () => void;
}) {
  return editado ? (
    <button type="button" className="auto-status" onClick={onRestaurar}>
      ↺ Voltar ao preenchimento automático
    </button>
  ) : (
    <span className="auto-status">Preenchido automaticamente · pode editar</span>
  );
}

function Field({
  label,
  children,
  full = false
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}