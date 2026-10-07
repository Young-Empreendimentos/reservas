const CONFIG = {
  LOTES_SHEET: 'lotes',
  RESERVAS_SHEET: 'reservas',
  CLIENTES_SHEET: 'clientes',
};

// Dados sensíveis ficam nas Propriedades do script (Configurações do projeto), não no código:
//   DRIVE_FOLDER_ID – pasta onde os anexos das reservas são salvos
//   ANEXOS_TOKEN    – token compartilhado com a Edge Function "reservas-anexos" do Supabase
function propriedade_(nome) {
  const v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v) throw new Error('Propriedade do script não configurada: ' + nome);
  return v;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'lotes';

  if (action === 'lotes') return json_(listarLotes_());
  if (action === 'clientes') return json_(buscarCliente_(e.parameter.cpf));

  return json_({ error: 'Ação não encontrada.' });
}

function doPost(e) {
  const inicio = Date.now();

  try {
    console.log('DOPOST RECEBIDO');

    const body = JSON.parse(
      (e && e.postData && e.postData.contents) || '{}'
    );

    console.log('ACTION: ' + body.action);
    console.log('NUMERO: ' + body.numero);

    // Sistema novo (Supabase): só salva os anexos no Drive e devolve os links.
    if (body.action === 'anexos') {
      if (!body.token || body.token !== propriedade_('ANEXOS_TOKEN')) {
        return json_({ ok: false, error: 'Não autorizado.' });
      }
      const links = salvarAnexos_(body.arquivos || {}, String(body.numero || ''), body.cpf, body.nome);
      return json_({ ok: true, ...links });
    }

    if (body.action === 'reservar') {
      console.log('INICIANDO RESERVA');

      const resultado = reservarLote_(body);

      console.log(
        'RESERVA FINALIZADA EM ' +
        (Date.now() - inicio) +
        ' ms'
      );

      return json_({
        ...resultado,
        diagnostico: {
          tempoTotalMs: Date.now() - inicio
        }
      });
    }

    return json_({
      error: 'Ação não encontrada.'
    });

  } catch (error) {
    console.error(
      'ERRO DOPOST: ' +
      String(error)
    );

    return json_({
      ok: false,
      error: String(error),
      diagnostico: {
        tempoTotalMs: Date.now() - inicio
      }
    });
  }
}

function listarLotes_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(CONFIG.LOTES_SHEET);

  if (!sheet) {
    throw new Error('Aba "lotes" não encontrada.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return { lotes: [] };
  }

  const headers = values[0].map(h =>
    String(h).trim().toLowerCase()
  );

  const index = {};

  headers.forEach((header, i) => {
    index[header] = i;
  });

  const required = [
    'id',
    'numero',
    'metragem',
    'preco',
    'status'
  ];

  required.forEach(name => {
    if (index[name] === undefined) {
      throw new Error(
        `Coluna "${name}" não encontrada na aba lotes.`
      );
    }
  });

  const lotes = values
    .slice(1)
    .filter(row =>
      row[index.numero] !== '' &&
      row[index.numero] !== null
    )
    .map(row => ({
      id: row[index.id],
      numero: String(row[index.numero]),
      metragem: numberOrNull_(row[index.metragem]),
      preco: numberOrNull_(row[index.preco]),
      status: normalizeStatus_(row[index.status]),
    }));

  return {
    lotes,
    atualizadoEm: new Date().toISOString()
  };
}

function reservarLote_(body) {
  const inicio = Date.now();

  const numero = String(body.numero || '').trim();

  if (!numero) {
    throw new Error('Número do lote não informado.');
  }

  const lock = LockService.getScriptLock();

  console.log('RESERVA: aguardando lock');

  lock.waitLock(30000);

  console.log(
    'RESERVA: lock obtido em',
    Date.now() - inicio,
    'ms'
  );

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const lotesSheet =
      ss.getSheetByName(CONFIG.LOTES_SHEET);

    if (!lotesSheet) {
      throw new Error('Aba "lotes" não encontrada.');
    }

    const values =
      lotesSheet.getDataRange().getValues();

    console.log(
      'RESERVA: leitura da aba lotes',
      Date.now() - inicio,
      'ms'
    );

    if (values.length < 2) {
      throw new Error('Aba "lotes" está vazia.');
    }

    const headers = values[0].map(h =>
      String(h).trim().toLowerCase()
    );

    const numeroIndex =
      headers.indexOf('numero');

    const statusIndex =
      headers.indexOf('status');

    if (
      numeroIndex === -1 ||
      statusIndex === -1
    ) {
      throw new Error(
        'As colunas numero e status são obrigatórias na aba lotes.'
      );
    }

    let rowNumber = -1;

    for (
      let i = 1;
      i < values.length;
      i++
    ) {
      if (
        String(
          values[i][numeroIndex]
        ).trim() === numero
      ) {
        rowNumber = i + 1;
        break;
      }
    }

    if (rowNumber === -1) {
      throw new Error(
        `Lote ${numero} não encontrado.`
      );
    }

    const currentStatus =
      normalizeStatus_(
        lotesSheet
          .getRange(
            rowNumber,
            statusIndex + 1
          )
          .getValue()
      );

    console.log(
      'RESERVA: status verificado',
      currentStatus,
      Date.now() - inicio,
      'ms'
    );

    if (currentStatus !== 'disponivel') {
      return {
        ok: false,
        error:
          `O lote ${numero} não está disponível.`,
        status: currentStatus
      };
    }

    const reservation =
      body.dados || {};

    if (!reservation.nome) {
      throw new Error(
        'Nome do comprador não informado.'
      );
    }

    if (!reservation.cpf) {
      throw new Error(
        'CPF do comprador não informado.'
      );
    }

    const dataReserva =
      new Date();

    let anexos = {
      pasta: '',
      identidade: '',
      comprovantePagamento: '',
      comprovanteResidencia: '',
      fichaAssinada: ''
    };

    try {
      anexos = salvarAnexos_(
        body.arquivos || {},
        numero,
        reservation.cpf,
        reservation.nome
      );
    } catch (erroAnexos) {
      // Falha no Drive não impede a reserva; o erro fica registrado nos logs.
      console.error('ANEXOS: erro ao salvar - ' + String(erroAnexos));
    }

    console.log(
      'RESERVA: anexos processados',
      Date.now() - inicio,
      'ms'
    );

    lotesSheet
      .getRange(
        rowNumber,
        statusIndex + 1
      )
      .setValue('Reservado');

    console.log(
      'RESERVA: lote marcado como reservado',
      Date.now() - inicio,
      'ms'
    );

    const reservasSheet =
      ss.getSheetByName(
        CONFIG.RESERVAS_SHEET
      ) ||
      ss.insertSheet(
        CONFIG.RESERVAS_SHEET
      );

    const clientesSheet =
      ss.getSheetByName(
        CONFIG.CLIENTES_SHEET
      ) ||
      ss.insertSheet(
        CONFIG.CLIENTES_SHEET
      );

    ensureReservationHeaders_(
      reservasSheet
    );

    ensureClientHeaders_(
      clientesSheet
    );

    console.log(
      'RESERVA: abas preparadas',
      Date.now() - inicio,
      'ms'
    );

    salvarCliente_(
      clientesSheet,
      reservation
    );

    console.log(
      'RESERVA: cliente salvo',
      Date.now() - inicio,
      'ms'
    );

    salvarReserva_(
      reservasSheet,
      numero,
      reservation,
      dataReserva,
      anexos
    );

    console.log(
      'RESERVA: reserva salva',
      Date.now() - inicio,
      'ms'
    );

    console.log(
      'RESERVA: FINALIZADA EM',
      Date.now() - inicio,
      'ms'
    );

    return {
      ok: true,
      numero,
      status: 'reservado'
    };

  } finally {
    lock.releaseLock();
  }
}

function salvarAnexos_(arquivos, numero, cpf, nome) {
  const inicio = Date.now();

  // Campo enviado pelo formulário -> coluna da aba reservas
  const colunas = {
    arquivo_titular: 'identidade',
    arquivo_identidade: 'identidade',
    arquivo_comprovante_residencia: 'comprovanteResidencia',
    arquivo_comprovanteResidencia: 'comprovanteResidencia',
    arquivo_comprovantePagamento: 'comprovantePagamento',
    arquivo_comprovante_pagamento: 'comprovantePagamento',
    arquivo_fichaAssinada: 'fichaAssinada',
    arquivo_segundo_comprador: 'documentoSegundoComprador'
  };

  const rotulos = {
    arquivo_titular: 'Documento do titular',
    arquivo_identidade: 'Documento de identidade',
    arquivo_comprovante_residencia: 'Comprovante de residência',
    arquivo_comprovanteResidencia: 'Comprovante de residência',
    arquivo_comprovantePagamento: 'Comprovante de pagamento',
    arquivo_comprovante_pagamento: 'Comprovante de pagamento',
    arquivo_fichaAssinada: 'Ficha de reserva assinada',
    arquivo_segundo_comprador: 'Documento do segundo comprador',
    arquivo_outros: 'Outros documentos'
  };

  const resultado = {
    pasta: '',
    identidade: '',
    comprovantePagamento: '',
    comprovanteResidencia: '',
    fichaAssinada: '',
    documentoSegundoComprador: ''
  };

  const chaves = Object.keys(arquivos || {}).filter(
    chave => arquivos[chave] && arquivos[chave].conteudoBase64
  );

  console.log('ANEXOS: arquivos recebidos = ' + chaves.length);

  if (chaves.length === 0) {
    return resultado;
  }

  const pastaPrincipal = obterPastaPrincipal_();

  const cpfLimpo = normalizarCpf_(cpf) || 'sem-cpf';
  const nomeCliente = String(nome || '').trim();
  const nomePasta = nomeCliente
    ? `Lote ${numero} - ${nomeCliente} - ${cpfLimpo}`
    : `Lote ${numero} - ${cpfLimpo}`;

  const pastaReserva = pastaPrincipal.createFolder(nomePasta);
  resultado.pasta = pastaReserva.getUrl();

  chaves.forEach(chave => {
    const arquivo = arquivos[chave];
    const rotulo = rotulos[chave] || chave.replace(/^arquivo_/, '');

    const blob = Utilities.newBlob(
      Utilities.base64Decode(arquivo.conteudoBase64),
      arquivo.tipo || 'application/octet-stream',
      `${rotulo} - ${arquivo.nome || chave}`
    );

    const file = pastaReserva.createFile(blob);

    console.log('ANEXOS: salvo ' + chave + ' em ' + (Date.now() - inicio) + ' ms');

    if (colunas[chave]) {
      resultado[colunas[chave]] = file.getUrl();
    }
  });

  console.log('ANEXOS: finalizado em ' + (Date.now() - inicio) + ' ms');

  return resultado;
}

// Rode uma vez no editor para autorizar o acesso ao Drive.
function autorizarDrive() {
  const pasta = obterPastaPrincipal_();
  console.log('Pasta de anexos OK: ' + pasta.getName() + ' - ' + pasta.getUrl());
}

function obterPastaPrincipal_() {
  return DriveApp.getFolderById(
    propriedade_('DRIVE_FOLDER_ID')
  );
}

function salvarReserva_(
  sheet,
  numero,
  reservation,
  dataReserva,
  anexos
) {
  sheet.appendRow([
    dataReserva,
    numero,

    reservation.intermediacao || '',
    reservation.responsavelReserva || '',

    reservation.nome || '',
    reservation.escolaridade || '',
    reservation.nacionalidade || reservation.Nacionalidade || '',
    reservation.sexo || '',
    reservation.estadoCivil || '',
    reservation.dataCasamento || '',
    reservation.regimeBens || '',
    reservation.profissao || '',
    reservation.dataNascimento || '',
    reservation.cpf || '',
    reservation.rgCnh || '',
    reservation.orgaoExpedidor || '',
    reservation.dataExpedicao || '',
    reservation.endereco || '',
    reservation.cidade || '',
    reservation.email || '',
    reservation.telefone || '',

    reservation.nomeSecundario || '',
    reservation.nacionalidadeSecundario || reservation.NacionalidadeSecundario || '',
    reservation.sexoSecundario || '',
    reservation.dataNascimentoSecundario || '',
    reservation.cpfSecundario || '',
    reservation.rgCnhSecundario || reservation.rgSecundario || '',
    reservation.orgaoExpedidorSecundario || '',
    reservation.dataExpedicaoSecundario || '',
    reservation.empresaSecundario || '',
    reservation.profissaoSecundario || '',
    reservation.enderecoSecundario || '',
    reservation.emailSecundario || '',
    reservation.telefoneSecundario || '',

    reservation.tipoResidencia || '',
    reservation.tempoResidencia || '',
    reservation.rendaFamiliar || '',
    reservation.filhos || '',

    Array.isArray(
      reservation.interesses
    )
      ? reservation.interesses.join(', ')
      : reservation.interesses || '',

    reservation.formaPagamento || '',
    reservation.motivoCompra || '',
    reservation.quantidadeTerrenos || '',
    reservation.recomendacao || '',
    reservation.origem || '',
    reservation.observacoes || '',

    anexos.pasta || '',
    anexos.identidade || '',
    anexos.comprovantePagamento || '',
    anexos.comprovanteResidencia || '',
    anexos.fichaAssinada || '',

    'Pendente',

    // Termo de arras (colunas novas, no fim para não deslocar as antigas)
    reservation.imovelObjeto || '',
    reservation.valorArras || '',
    reservation.precoCondicoes || '',
    reservation.valorCorretagemBeneficiario || ''
  ]);
}

function salvarCliente_(
  sheet,
  reservation
) {
  const cpf =
    normalizarCpf_(
      reservation.cpf
    );

  if (!cpf) {
    return;
  }

  const values =
    sheet.getDataRange().getValues();

  let cpfIndex = -1;

  if (values.length > 0) {
    const headers =
      values[0].map(h =>
        String(h)
          .trim()
          .toLowerCase()
      );

    cpfIndex =
      headers.indexOf('cpf');
  }

  let existingRow = -1;

  if (
    cpfIndex !== -1 &&
    values.length > 1
  ) {
    for (
      let i = 1;
      i < values.length;
      i++
    ) {
      const cpfExistente =
        normalizarCpf_(
          values[i][cpfIndex]
        );

      if (
        cpfExistente === cpf
      ) {
        existingRow = i + 1;
        break;
      }
    }
  }

  const row = [
    new Date(),

    reservation.nome || '',
    reservation.escolaridade || '',
    reservation.nacionalidade || reservation.Nacionalidade || '',
    reservation.sexo || '',
    reservation.estadoCivil || '',
    reservation.dataCasamento || '',
    reservation.regimeBens || '',
    reservation.profissao || '',
    reservation.dataNascimento || '',
    reservation.cpf || '',
    reservation.rgCnh || '',
    reservation.orgaoExpedidor || '',
    reservation.dataExpedicao || '',
    reservation.endereco || '',
    reservation.cidade || '',
    reservation.email || '',
    reservation.telefone || '',

    reservation.nomeSecundario || '',
    reservation.nacionalidadeSecundario || reservation.NacionalidadeSecundario || '',
    reservation.sexoSecundario || '',
    reservation.dataNascimentoSecundario || '',
    reservation.cpfSecundario || '',
    reservation.rgCnhSecundario || reservation.rgSecundario || '',
    reservation.orgaoExpedidorSecundario || '',
    reservation.dataExpedicaoSecundario || '',
    reservation.empresaSecundario || '',
    reservation.profissaoSecundario || '',
    reservation.enderecoSecundario || '',
    reservation.emailSecundario || '',
    reservation.telefoneSecundario || '',

    reservation.tipoResidencia || '',
    reservation.tempoResidencia || '',
    reservation.rendaFamiliar || '',
    reservation.filhos || '',

    Array.isArray(
      reservation.interesses
    )
      ? reservation.interesses.join(', ')
      : reservation.interesses || '',

    reservation.formaPagamento || '',
    reservation.motivoCompra || '',
    reservation.quantidadeTerrenos || '',
    reservation.recomendacao || '',
    reservation.origem || '',
    reservation.observacoes || ''
  ];

  if (existingRow !== -1) {
    sheet
      .getRange(
        existingRow,
        1,
        1,
        row.length
      )
      .setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function ensureReservationHeaders_(
  sheet
) {
  const headers = [
    'data',
    'lote',

    'intermediacao',
    'responsavelReserva',

    'nome',
    'escolaridade',
    'nacionalidade',
    'sexo',
    'estadoCivil',
    'dataCasamento',
    'regimeBens',
    'profissao',
    'dataNascimento',
    'cpf',
    'rgCnh',
    'orgaoExpedidor',
    'dataExpedicao',
    'endereco',
    'cidade',
    'email',
    'telefone',

    'nomeSecundario',
    'nacionalidadeSecundario',
    'sexoSecundario',
    'dataNascimentoSecundario',
    'cpfSecundario',
    'rgCnhSecundario',
    'orgaoExpedidorSecundario',
    'dataExpedicaoSecundario',
    'empresaSecundario',
    'profissaoSecundario',
    'enderecoSecundario',
    'emailSecundario',
    'telefoneSecundario',

    'tipoResidencia',
    'tempoResidencia',
    'rendaFamiliar',
    'filhos',
    'interesses',
    'formaPagamento',
    'motivoCompra',
    'quantidadeTerrenos',
    'recomendacao',
    'origem',
    'observacoes',

    'pastaAnexos',
    'documentoIdentidade',
    'comprovantePagamento',
    'comprovanteResidencia',
    'fichaAssinada',

    'situacao',

    'imovelObjeto',
    'valorArras',
    'precoCondicoes',
    'valorCorretagemBeneficiario'
  ];

  ensureHeaders_(
    sheet,
    headers
  );

  // Dá título só às colunas novas do arras (no fim), sem tocar nos títulos existentes.
  const novas = ['imovelObjeto', 'valorArras', 'precoCondicoes', 'valorCorretagemBeneficiario'];
  novas.forEach(nome => {
    const col = headers.indexOf(nome) + 1;
    const cell = sheet.getRange(1, col);
    if (cell.getValue() === '') cell.setValue(nome);
  });
}

function ensureClientHeaders_(
  sheet
) {
  const headers = [
    'dataCadastro',

    'nome',
    'escolaridade',
    'nacionalidade',
    'sexo',
    'estadoCivil',
    'dataCasamento',
    'regimeBens',
    'profissao',
    'dataNascimento',
    'cpf',
    'rgCnh',
    'orgaoExpedidor',
    'dataExpedicao',
    'endereco',
    'cidade',
    'email',
    'telefone',

    'nomeSecundario',
    'nacionalidadeSecundario',
    'sexoSecundario',
    'dataNascimentoSecundario',
    'cpfSecundario',
    'rgCnhSecundario',
    'orgaoExpedidorSecundario',
    'dataExpedicaoSecundario',
    'empresaSecundario',
    'profissaoSecundario',
    'enderecoSecundario',
    'emailSecundario',
    'telefoneSecundario',

    'tipoResidencia',
    'tempoResidencia',
    'rendaFamiliar',
    'filhos',
    'interesses',
    'formaPagamento',
    'motivoCompra',
    'quantidadeTerrenos',
    'recomendacao',
    'origem',
    'observacoes'
  ];

  ensureHeaders_(
    sheet,
    headers
  );
}

function ensureHeaders_(
  sheet,
  headers
) {
  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);

    return;
  }

  const current =
    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .getValues()[0];

  const empty =
    current.every(
      value => value === ''
    );

  if (empty) {
    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);
  }
}

function buscarCliente_(cpf) {
  const cpfBusca =
    normalizarCpf_(cpf);

  if (!cpfBusca) {
    return {
      encontrado: false
    };
  }

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        CONFIG.CLIENTES_SHEET
      );

  if (
    !sheet ||
    sheet.getLastRow() < 2
  ) {
    return {
      encontrado: false
    };
  }

  const values =
    sheet
      .getDataRange()
      .getValues();

  const headers =
    values[0].map(h =>
      String(h).trim()
    );

  const cpfIndex =
    headers
      .map(h =>
        h.toLowerCase()
      )
      .indexOf('cpf');

  if (cpfIndex === -1) {
    return {
      encontrado: false
    };
  }

  for (
    let i = 1;
    i < values.length;
    i++
  ) {
    const cpfCliente =
      normalizarCpf_(
        values[i][cpfIndex]
      );

    if (
      cpfCliente === cpfBusca
    ) {
      const cliente = {};

      headers.forEach(
        (header, index) => {
          cliente[header] =
            values[i][index];
        }
      );

      return {
        encontrado: true,
        cliente
      };
    }
  }

  return {
    encontrado: false
  };
}

function normalizarCpf_(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .trim();
}

function normalizeStatus_(value) {
  const status =
    String(value || '')
      .trim()
      .toLowerCase();

  if (status === 'reservado') {
    return 'reservado';
  }

  return 'disponivel';
}

function numberOrNull_(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function json_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

function testeReserva() {
  const resultado =
    reservarLote_({
      numero: '111',
      dados: {
        nome: 'TESTE AUTORIZAÇÃO',
        cpf: '00000000000'
      },
      arquivos: {}
    });

  console.log(
    JSON.stringify(resultado)
  );
}

function testeDoPost() {
  return json_({
    ok: true,
    mensagem: 'DOPOST FUNCIONANDO'
  });
}