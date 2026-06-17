const { ulid } = require('ulid');
const { Op } = require('sequelize');
const {
  Arquivo,
  Caixa,
  Nf,
  NfEvento,
  Pdv,
  Venda,
} = require('../models');
const configuracaoSistemaService = require('../services/configuracaoSistemaService');

const allowedStatuses = new Set([
  'rascunho',
  'pendente',
  'transmitindo',
  'autorizada',
  'contingencia',
  'rejeitada',
  'denegada',
  'cancelada',
  'inutilizada',
  'erro_tecnico',
  'duplicidade',
]);

function getPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function normalizeText(value, maxLength = 255) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeInteger(value, fallback, { min = 0, max = 999999999 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeNullableInteger(value, { min = 1, max = 2147483647 } = {}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeModelo(value, fallback = '65') {
  const modelo = normalizeText(value, 2);

  if (modelo === '55' || modelo === '65') {
    return modelo;
  }

  if (fallback === '') {
    return '';
  }

  return fallback === '55' ? '55' : '65';
}

function normalizeAmbiente(value, fallback = 'homologacao') {
  const ambiente = normalizeText(value, 20);

  if (ambiente === 'producao' || ambiente === 'homologacao') {
    return ambiente;
  }

  return fallback === 'producao' ? 'producao' : 'homologacao';
}

function normalizeStatus(value, fallback = 'rascunho') {
  const status = normalizeText(value, 32);

  return allowedStatuses.has(status) ? status : fallback;
}

function sanitizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeArquivoResumo(arquivo) {
  if (!arquivo) {
    return null;
  }

  const data = getPlain(arquivo);

  return {
    id: data.id,
    nome_original: data.nome_original,
    mime_type: data.mime_type,
    tipo: data.tipo,
    tamanho_bytes: Number(data.tamanho_bytes || 0),
    created_at: data.created_at,
  };
}

function sanitizeEvento(evento) {
  const data = getPlain(evento);

  return {
    id: data.id,
    nf_id: data.nf_id,
    tipo: data.tipo,
    status: data.status,
    codigo_retorno_sefaz: data.codigo_retorno_sefaz || null,
    mensagem: data.mensagem || null,
    arquivo_xml_id: data.arquivo_xml_id || null,
    detalhes: data.detalhes && typeof data.detalhes === 'object' ? data.detalhes : {},
    ocorrido_em: toIso(data.ocorrido_em),
    created_at: toIso(data.created_at),
  };
}

function sanitizeNf(nf, { includePayload = false } = {}) {
  const data = getPlain(nf);

  return {
    id: data.id,
    venda_id: data.venda_id || null,
    pdv_id: data.pdv_id || null,
    caixa_id: data.caixa_id || null,
    ambiente: data.ambiente,
    modelo: data.modelo,
    serie: Number(data.serie || 0),
    numero: Number(data.numero || 0),
    chave_acesso: data.chave_acesso || null,
    status: data.status,
    tipo_emissao: data.tipo_emissao,
    finalidade: data.finalidade,
    natureza_operacao: data.natureza_operacao,
    total_centavos: Number(data.total_centavos || 0),
    protocolo_autorizacao: data.protocolo_autorizacao || null,
    protocolo_cancelamento: data.protocolo_cancelamento || null,
    codigo_retorno_sefaz: data.codigo_retorno_sefaz || null,
    mensagem_retorno_sefaz: data.mensagem_retorno_sefaz || null,
    ultimo_erro_tecnico: data.ultimo_erro_tecnico || null,
    xml_enviado_arquivo_id: data.xml_enviado_arquivo_id || null,
    xml_autorizado_arquivo_id: data.xml_autorizado_arquivo_id || null,
    danfe_pdf_arquivo_id: data.danfe_pdf_arquivo_id || null,
    xml_enviado: sanitizeArquivoResumo(data.xml_enviado),
    xml_autorizado: sanitizeArquivoResumo(data.xml_autorizado),
    danfe_pdf: sanitizeArquivoResumo(data.danfe_pdf),
    retorno_sefaz: data.retorno_sefaz && typeof data.retorno_sefaz === 'object' ? data.retorno_sefaz : {},
    eventos: Array.isArray(data.eventos) ? data.eventos : [],
    historico: Array.isArray(data.historico) ? data.historico.map(sanitizeEvento) : [],
    payload: includePayload && data.payload && typeof data.payload === 'object' ? data.payload : undefined,
    emitida_em: toIso(data.emitida_em),
    autorizada_em: toIso(data.autorizada_em),
    cancelada_em: toIso(data.cancelada_em),
    created_at: toIso(data.created_at),
    updated_at: toIso(data.updated_at),
  };
}

function createNfId() {
  return `nf-${ulid().toLowerCase()}`;
}

function getFiscalDefaults(fiscal, modelo, ambiente) {
  const targetAmbiente = normalizeAmbiente(ambiente, fiscal?.ambiente);
  const environmentConfig = fiscal?.ambientes?.[targetAmbiente] || fiscal || {};
  const serieConfig = modelo === '55' ? environmentConfig?.nfe : environmentConfig?.nfce;

  return {
    ambiente: targetAmbiente,
    modelo,
    serie: normalizeInteger(serieConfig?.serie, 1, { min: 1, max: 999 }),
    numero: normalizeInteger(serieConfig?.proximo_numero, 1, { min: 1, max: 999999999 }),
    natureza_operacao: normalizeText(fiscal?.natureza_operacao_padrao, 120) || 'Venda',
  };
}

async function findNfForUser(usuarioId, id, options = {}) {
  return Nf.findOne({
    where: {
      id,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function appendNfEvent(nf, eventData) {
  const now = new Date();
  const eventoResumo = {
    tipo: eventData.tipo,
    status: eventData.status,
    codigo_retorno_sefaz: eventData.codigo_retorno_sefaz || null,
    mensagem: eventData.mensagem || null,
    ocorrido_em: now.toISOString(),
  };

  const eventos = Array.isArray(nf.eventos) ? nf.eventos : [];

  nf.eventos = [...eventos, eventoResumo].slice(-80);

  return NfEvento.create({
    nf_id: nf.id,
    usuario_id: nf.usuario_id,
    tipo: eventData.tipo,
    status: eventData.status,
    codigo_retorno_sefaz: eventData.codigo_retorno_sefaz || null,
    mensagem: eventData.mensagem || null,
    arquivo_xml_id: eventData.arquivo_xml_id || null,
    detalhes: eventData.detalhes && typeof eventData.detalhes === 'object' ? eventData.detalhes : {},
    ocorrido_em: now,
  });
}

module.exports = {
  async list(req, res) {
    const limit = normalizeInteger(req.query.limit, 50, { min: 1, max: 100 });
    const offset = normalizeInteger(req.query.offset, 0, { min: 0, max: 1000000 });
    const where = {
      usuario_id: req.user.id,
    };

    const status = normalizeText(req.query.status, 32);
    const modelo = normalizeModelo(req.query.modelo, '');
    const ambiente = normalizeText(req.query.ambiente, 20);
    const termo = normalizeText(req.query.q, 80);

    if (status && allowedStatuses.has(status)) {
      where.status = status;
    }

    if (modelo) {
      where.modelo = modelo;
    }

    if (ambiente === 'homologacao' || ambiente === 'producao') {
      where.ambiente = ambiente;
    }

    if (termo) {
      const numero = Number(termo);

      where[Op.or] = [
        { chave_acesso: { [Op.iLike]: `%${termo}%` } },
        { protocolo_autorizacao: { [Op.iLike]: `%${termo}%` } },
      ];

      if (Number.isInteger(numero)) {
        where[Op.or].push({ numero });
      }
    }

    const { rows, count } = await Nf.findAndCountAll({
      where,
      include: [
        { model: Arquivo, as: 'xml_autorizado', required: false },
        { model: Arquivo, as: 'danfe_pdf', required: false },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      items: rows.map(nf => sanitizeNf(nf)),
      total: count,
      limit,
      offset,
    });
  },

  async create(req, res) {
    try {
      const body = req.body || {};
      const configuracao = await configuracaoSistemaService.getConfiguracaoSnapshot(req.user.id);
      const modelo = normalizeModelo(body.modelo, configuracao.fiscal?.modelo_prioritario || '65');
      const ambiente = normalizeAmbiente(body.ambiente, configuracao.fiscal?.ambiente);
      const defaults = getFiscalDefaults(configuracao.fiscal, modelo, ambiente);
      const vendaId = normalizeText(body.venda_id || body.vendaId, 64) || null;
      let venda = null;

      if (vendaId) {
        venda = await Venda.findOne({
          where: {
            id: vendaId,
            usuario_id: req.user.id,
          },
        });

        if (!venda) {
          return res.status(404).json({ message: 'Venda não encontrada para esta conta.' });
        }
      }

      const vendaData = venda ? getPlain(venda) : null;
      const nf = await Nf.create({
        id: normalizeText(body.id, 64) || createNfId(),
        usuario_id: req.user.id,
        venda_id: vendaId,
        pdv_id: normalizeNullableInteger(body.pdv_id || body.pdvId) || vendaData?.pdv_id || null,
        caixa_id: normalizeText(body.caixa_id || body.caixaId, 64) || vendaData?.caixa_id || null,
        ambiente: defaults.ambiente,
        modelo,
        serie: normalizeInteger(body.serie, defaults.serie, { min: 1, max: 999 }),
        numero: normalizeInteger(body.numero, defaults.numero, { min: 1, max: 999999999 }),
        chave_acesso: normalizeText(body.chave_acesso || body.chaveAcesso, 44) || null,
        status: normalizeStatus(body.status),
        tipo_emissao: normalizeText(body.tipo_emissao || body.tipoEmissao, 24) || 'normal',
        finalidade: normalizeText(body.finalidade, 24) || 'normal',
        natureza_operacao: normalizeText(body.natureza_operacao || body.naturezaOperacao, 120) || defaults.natureza_operacao,
        total_centavos: normalizeInteger(body.total_centavos || body.totalCentavos, vendaData?.total_centavos || 0),
        protocolo_autorizacao: normalizeText(body.protocolo_autorizacao || body.protocoloAutorizacao, 80) || null,
        protocolo_cancelamento: normalizeText(body.protocolo_cancelamento || body.protocoloCancelamento, 80) || null,
        codigo_retorno_sefaz: normalizeText(body.codigo_retorno_sefaz || body.codigoRetornoSefaz, 20) || null,
        mensagem_retorno_sefaz: normalizeText(body.mensagem_retorno_sefaz || body.mensagemRetornoSefaz, 2000) || null,
        ultimo_erro_tecnico: normalizeText(body.ultimo_erro_tecnico || body.ultimoErroTecnico, 2000) || null,
        xml_enviado_arquivo_id: normalizeNullableInteger(body.xml_enviado_arquivo_id || body.xmlEnviadoArquivoId),
        xml_autorizado_arquivo_id: normalizeNullableInteger(body.xml_autorizado_arquivo_id || body.xmlAutorizadoArquivoId),
        danfe_pdf_arquivo_id: normalizeNullableInteger(body.danfe_pdf_arquivo_id || body.danfePdfArquivoId),
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        retorno_sefaz: body.retorno_sefaz && typeof body.retorno_sefaz === 'object' ? body.retorno_sefaz : {},
        eventos: [],
        emitida_em: sanitizeDate(body.emitida_em || body.emitidaEm),
        autorizada_em: sanitizeDate(body.autorizada_em || body.autorizadaEm),
        cancelada_em: sanitizeDate(body.cancelada_em || body.canceladaEm),
      });

      await appendNfEvent(nf, {
        tipo: 'registro',
        status: nf.status,
        codigo_retorno_sefaz: nf.codigo_retorno_sefaz,
        mensagem: nf.mensagem_retorno_sefaz,
        detalhes: {
          origem: 'api',
        },
      });
      await nf.save();

      return res.status(201).json(sanitizeNf(nf, { includePayload: true }));
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          code: 'NF_NUMBER_ALREADY_EXISTS',
          message: 'Já existe uma nota com este ambiente, modelo, série e número.',
        });
      }

      return res.status(500).json({
        message: 'Não foi possível registrar a nota fiscal.',
        detail: error.message,
      });
    }
  },

  async show(req, res) {
    const nf = await findNfForUser(req.user.id, req.params.id, {
      include: [
        { model: Venda, as: 'venda', required: false },
        { model: Pdv, as: 'pdv', required: false },
        { model: Caixa, as: 'caixa', required: false },
        { model: Arquivo, as: 'xml_enviado', required: false },
        { model: Arquivo, as: 'xml_autorizado', required: false },
        { model: Arquivo, as: 'danfe_pdf', required: false },
        { model: NfEvento, as: 'historico', required: false },
      ],
      order: [[{ model: NfEvento, as: 'historico' }, 'ocorrido_em', 'DESC']],
    });

    if (!nf) {
      return res.status(404).json({ message: 'Nota fiscal não encontrada.' });
    }

    return res.json(sanitizeNf(nf, { includePayload: true }));
  },

  async updateStatus(req, res) {
    try {
      const nf = await findNfForUser(req.user.id, req.params.id);

      if (!nf) {
        return res.status(404).json({ message: 'Nota fiscal não encontrada.' });
      }

      const body = req.body || {};
      const nextStatus = normalizeStatus(body.status, nf.status);
      const now = new Date();

      nf.status = nextStatus;
      nf.chave_acesso = normalizeText(body.chave_acesso || body.chaveAcesso, 44) || nf.chave_acesso || null;
      nf.protocolo_autorizacao = normalizeText(body.protocolo_autorizacao || body.protocoloAutorizacao, 80) || nf.protocolo_autorizacao || null;
      nf.protocolo_cancelamento = normalizeText(body.protocolo_cancelamento || body.protocoloCancelamento, 80) || nf.protocolo_cancelamento || null;
      nf.codigo_retorno_sefaz = normalizeText(body.codigo_retorno_sefaz || body.codigoRetornoSefaz, 20) || nf.codigo_retorno_sefaz || null;
      nf.mensagem_retorno_sefaz = normalizeText(body.mensagem_retorno_sefaz || body.mensagemRetornoSefaz, 2000) || nf.mensagem_retorno_sefaz || null;
      nf.ultimo_erro_tecnico = normalizeText(body.ultimo_erro_tecnico || body.ultimoErroTecnico, 2000) || nf.ultimo_erro_tecnico || null;
      nf.xml_enviado_arquivo_id = normalizeNullableInteger(body.xml_enviado_arquivo_id || body.xmlEnviadoArquivoId) || nf.xml_enviado_arquivo_id || null;
      nf.xml_autorizado_arquivo_id = normalizeNullableInteger(body.xml_autorizado_arquivo_id || body.xmlAutorizadoArquivoId) || nf.xml_autorizado_arquivo_id || null;
      nf.danfe_pdf_arquivo_id = normalizeNullableInteger(body.danfe_pdf_arquivo_id || body.danfePdfArquivoId) || nf.danfe_pdf_arquivo_id || null;
      nf.retorno_sefaz = body.retorno_sefaz && typeof body.retorno_sefaz === 'object' ? body.retorno_sefaz : nf.retorno_sefaz || {};

      if (nextStatus === 'transmitindo' && !nf.emitida_em) {
        nf.emitida_em = now;
      }

      if (nextStatus === 'autorizada' && !nf.autorizada_em) {
        nf.autorizada_em = now;
      }

      if (nextStatus === 'cancelada' && !nf.cancelada_em) {
        nf.cancelada_em = now;
      }

      await appendNfEvent(nf, {
        tipo: normalizeText(body.tipo_evento || body.tipoEvento, 32) || nextStatus,
        status: nextStatus,
        codigo_retorno_sefaz: nf.codigo_retorno_sefaz,
        mensagem: nf.mensagem_retorno_sefaz || nf.ultimo_erro_tecnico,
        arquivo_xml_id: nf.xml_autorizado_arquivo_id || nf.xml_enviado_arquivo_id,
        detalhes: body.detalhes && typeof body.detalhes === 'object' ? body.detalhes : {},
      });
      await nf.save();

      return res.json(sanitizeNf(nf, { includePayload: true }));
    } catch (error) {
      return res.status(500).json({
        message: 'Não foi possível atualizar a nota fiscal.',
        detail: error.message,
      });
    }
  },
};
