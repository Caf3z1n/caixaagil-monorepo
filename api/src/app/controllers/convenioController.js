const { col, fn, Op } = require('sequelize');
const { Caixa, ClienteConvenio, Venda } = require('../models');

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sanitizeCents(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'sim', 'yes', 'on'].includes(normalizeKey(value));
  }

  return false;
}

function normalizeDigits(value, maxLength) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveTipoPessoa(value, fallback = 'fisica') {
  const key = normalizeKey(value || fallback);

  if (key === 'juridica' || key === 'pj' || key === 'pessoa juridica' || key === 'pessoa_juridica') {
    return 'juridica';
  }

  return 'fisica';
}

function resolveFiscalSource(body = {}) {
  return body.dados_fiscais || body.dadosFiscais || body.fiscal || body.emitente || {};
}

function sanitizeFiscalAddress(value) {
  const source = isObject(value) ? value : {};

  return {
    logradouro: normalizeText(source.logradouro || source.rua || source.street, 160),
    numero: normalizeText(source.numero || source.number, 20),
    complemento: normalizeText(source.complemento || source.details, 80),
    bairro: normalizeText(source.bairro || source.district, 80),
    codigo_municipio: normalizeDigits(source.codigo_municipio || source.codigoMunicipio || source.municipality, 7),
    municipio: normalizeText(source.municipio || source.cidade || source.city, 80),
    uf: normalizeText(source.uf || source.estado || source.state, 2).toUpperCase(),
    cep: normalizeDigits(source.cep || source.zip || source.code, 8),
  };
}

function sanitizeFiscalData(value) {
  const source = isObject(value) ? value : {};

  return {
    cnpj_cpf: normalizeDigits(source.cnpj_cpf || source.cnpjCpf || source.cnpj || source.documento, 14),
    razao_social: normalizeText(source.razao_social || source.razaoSocial || source.nome || source.name, 160),
    nome_fantasia: normalizeText(source.nome_fantasia || source.nomeFantasia || source.fantasia || source.alias, 160),
    inscricao_estadual: normalizeDigits(source.inscricao_estadual || source.inscricaoEstadual || source.ie, 20),
    inscricao_municipal: normalizeDigits(source.inscricao_municipal || source.inscricaoMunicipal || source.im, 20),
    crt: normalizeDigits(source.crt, 1),
    cnae: normalizeDigits(source.cnae, 7),
    email: normalizeText(source.email, 160).toLowerCase(),
    telefone: normalizeDigits(source.telefone || source.phone, 14),
    endereco: sanitizeFiscalAddress(source.endereco || source.address),
  };
}

function resolveClienteNome(tipoPessoa, body, dadosFiscais) {
  if (tipoPessoa === 'juridica') {
    return (
      normalizeText(dadosFiscais?.nome_fantasia, 160) ||
      normalizeText(body?.nome, 160) ||
      normalizeText(dadosFiscais?.razao_social, 160)
    );
  }

  return normalizeText(body?.nome, 160);
}

function getLegalClientFiscalValidationError(dadosFiscais) {
  const missing = [];
  const endereco = dadosFiscais?.endereco || {};

  if (!dadosFiscais?.cnpj_cpf || dadosFiscais.cnpj_cpf.length !== 14) {
    missing.push('CNPJ');
  }

  if (!dadosFiscais?.razao_social || dadosFiscais.razao_social.length < 2) {
    missing.push('razão social');
  }

  if (!dadosFiscais?.nome_fantasia || dadosFiscais.nome_fantasia.length < 2) {
    missing.push('nome fantasia');
  }

  if (!endereco.cep || endereco.cep.length !== 8) {
    missing.push('CEP');
  }

  if (!endereco.municipio) {
    missing.push('município');
  }

  if (!endereco.uf || endereco.uf.length !== 2) {
    missing.push('UF');
  }

  if (!endereco.codigo_municipio || endereco.codigo_municipio.length !== 7) {
    missing.push('código IBGE');
  }

  if (!endereco.logradouro) {
    missing.push('logradouro');
  }

  if (!endereco.numero) {
    missing.push('número');
  }

  if (!endereco.bairro) {
    missing.push('bairro');
  }

  if (missing.length > 0) {
    return `Informe ${missing.join(', ')} do cliente pessoa jurídica.`;
  }

  return null;
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function sanitizeCliente(cliente, extra = {}) {
  const data = cliente.get ? cliente.get({ plain: true }) : cliente;
  const registrosVinculados = Number(extra.registros_vinculados ?? data.registros_vinculados ?? 0);

  return {
    id: data.id,
    tipo_pessoa: data.tipo_pessoa || 'fisica',
    nome: data.nome,
    ativo: Boolean(data.ativo),
    permite_pagamento_frente_caixa: Boolean(data.permite_pagamento_frente_caixa),
    dados_fiscais: resolveTipoPessoa(data.tipo_pessoa) === 'juridica' ? sanitizeFiscalData(data.dados_fiscais) : null,
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
    created_at: toIso(data.created_at || data.createdAt),
    updated_at: toIso(data.updated_at || data.updatedAt),
  };
}

function sanitizeCaixaReferencia(caixa) {
  if (!caixa) {
    return null;
  }

  const data = caixa.get ? caixa.get({ plain: true }) : caixa;

  return {
    id: data.id || null,
    data_operacao_rotulo: data.data_operacao_rotulo || null,
    numero_turno: Number(data.numero_turno || 0) || null,
  };
}

function resolveStatusConvenio(venda) {
  const status = normalizeKey(venda.status_convenio);

  if (status === 'pago' || status === 'recebido' || status === 'baixado') {
    return 'pago';
  }

  return 'pendente';
}

function normalizeRecebimentoPaymentMethod(value) {
  const key = normalizeKey(value);

  if (key === 'dinheiro') {
    return 'dinheiro';
  }

  if (key === 'pix') {
    return 'pix';
  }

  if (key === 'cartao' || key === 'cartao_credito' || key === 'cartao_debito') {
    return 'cartao';
  }

  return null;
}

function getConvenioClienteNome(venda) {
  return normalizeText(venda.cliente_convenio?.nome, 160) ||
    normalizeText(venda.nome_cliente, 160) ||
    normalizeText(venda.nome_consumidor, 160) ||
    'Cliente não informado';
}

function sanitizeRecebimento(venda) {
  const data = venda.get ? venda.get({ plain: true }) : venda;
  const cliente = data.cliente_convenio ? sanitizeCliente(data.cliente_convenio) : null;
  const status = resolveStatusConvenio(data);

  return {
    id: data.id,
    codigo: data.codigo,
    titulo: data.titulo,
    cliente_convenio_id: data.cliente_convenio_id || null,
    convenio_id: data.convenio_id || null,
    cliente_nome: cliente?.nome || getConvenioClienteNome(data),
    cliente,
    nome_consumidor: data.nome_consumidor || null,
    observacao: data.observacao || null,
    itens_count: Number(data.quantidade_itens || 0),
    total_centavos: sanitizeCents(data.total_centavos),
    status_convenio: status,
    metodo_pagamento: data.metodo_pagamento || null,
    metodo_pagamento_recebimento: data.metodo_pagamento_recebimento || null,
    situacao: data.situacao,
    situacao_recebimento: data.situacao_recebimento,
    caixa: sanitizeCaixaReferencia(data.caixa),
    caixa_recebimento: sanitizeCaixaReferencia(data.caixa_recebimento),
    registrado_em: toIso(data.registrado_em),
    recebido_em: status === 'pago' ? toIso(data.recebido_em) : null,
  };
}

async function findUserCliente(usuarioId, id) {
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return ClienteConvenio.findOne({
    where: {
      id: numericId,
      usuario_id: usuarioId,
    },
  });
}

async function getClienteRegistrosVinculados(usuarioId, clienteId, options = {}) {
  return Venda.count({
    where: {
      usuario_id: usuarioId,
      cliente_convenio_id: clienteId,
    },
    ...options,
  });
}

async function findUserClienteNameConflict(usuarioId, nome, ignoredId = null) {
  const targetKey = normalizeKey(nome);

  if (!targetKey) {
    return null;
  }

  const clientes = await ClienteConvenio.findAll({
    where: {
      usuario_id: usuarioId,
      ativo: true,
    },
    attributes: ['id', 'nome'],
  });

  return clientes.find(cliente => {
    const data = cliente.get ? cliente.get({ plain: true }) : cliente;
    const clienteId = Number(data.id);

    if (ignoredId !== null && clienteId === Number(ignoredId)) {
      return false;
    }

    return normalizeKey(data.nome) === targetKey;
  }) || null;
}

async function findUserClienteCnpjConflict(usuarioId, cnpj, ignoredId = null) {
  const targetCnpj = normalizeDigits(cnpj, 14);

  if (targetCnpj.length !== 14) {
    return null;
  }

  const clientes = await ClienteConvenio.findAll({
    where: {
      usuario_id: usuarioId,
      ativo: true,
      tipo_pessoa: 'juridica',
    },
    attributes: ['id', 'dados_fiscais'],
  });

  return clientes.find(cliente => {
    const data = cliente.get ? cliente.get({ plain: true }) : cliente;
    const clienteId = Number(data.id);

    if (ignoredId !== null && clienteId === Number(ignoredId)) {
      return false;
    }

    return normalizeDigits(data.dados_fiscais?.cnpj_cpf, 14) === targetCnpj;
  }) || null;
}

async function findUserRecebimento(usuarioId, vendaId) {
  return Venda.findOne({
    where: {
      id: String(vendaId || ''),
      usuario_id: usuarioId,
      situacao: {
        [Op.notIn]: ['cancelada', 'cancelled', 'canceled'],
      },
      [Op.or]: [
        { metodo_pagamento: 'convenio' },
        { situacao: 'convenio' },
        { status_convenio: { [Op.in]: ['pendente', 'pago'] } },
      ],
    },
    include: [
      {
        model: ClienteConvenio,
        as: 'cliente_convenio',
        required: false,
      },
      {
        model: Caixa,
        as: 'caixa',
        required: false,
      },
      {
        model: Caixa,
        as: 'caixa_recebimento',
        required: false,
      },
    ],
  });
}

module.exports = {
  async listClientes(req, res) {
    try {
      const [clientes, vendasPorCliente] = await Promise.all([
        ClienteConvenio.findAll({
          where: {
            usuario_id: req.user.id,
          },
          order: [
            ['ativo', 'DESC'],
            ['nome', 'ASC'],
            ['id', 'ASC'],
          ],
        }),
        Venda.findAll({
          attributes: [
            'cliente_convenio_id',
            [fn('COUNT', col('id')), 'total'],
          ],
          where: {
            usuario_id: req.user.id,
            cliente_convenio_id: {
              [Op.ne]: null,
            },
          },
          group: ['cliente_convenio_id'],
          raw: true,
        }),
      ]);
      const countByClienteId = new Map(
        vendasPorCliente.map(item => [Number(item.cliente_convenio_id), Number(item.total) || 0])
      );

      return res.json({
        clientes: clientes.map(cliente =>
          sanitizeCliente(cliente, {
            registros_vinculados: countByClienteId.get(cliente.id) ?? 0,
          })
        ),
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar clientes de convênio.', detail: error.message });
    }
  },

  async createCliente(req, res) {
    try {
      const tipoPessoa = resolveTipoPessoa(req.body?.tipo_pessoa);
      const dadosFiscais = tipoPessoa === 'juridica' ? sanitizeFiscalData(resolveFiscalSource(req.body)) : null;
      const nome = resolveClienteNome(tipoPessoa, req.body, dadosFiscais);

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe o nome do cliente.' });
      }

      if (tipoPessoa === 'juridica') {
        const fiscalValidationError = getLegalClientFiscalValidationError(dadosFiscais);

        if (fiscalValidationError) {
          return res.status(400).json({ message: fiscalValidationError });
        }

        const cnpjDuplicate = await findUserClienteCnpjConflict(req.user.id, dadosFiscais.cnpj_cpf);

        if (cnpjDuplicate) {
          return res.status(409).json({
            code: 'CLIENTE_CONVENIO_CNPJ_DUPLICADO',
            message: 'Já existe um cliente pessoa jurídica com esse CNPJ.',
          });
        }
      }

      const duplicate = await findUserClienteNameConflict(req.user.id, nome);

      if (duplicate) {
        return res.status(409).json({
          code: 'CLIENTE_CONVENIO_NOME_DUPLICADO',
          message: 'Já existe um cliente com esse nome.',
        });
      }

      const cliente = await ClienteConvenio.create({
        usuario_id: req.user.id,
        tipo_pessoa: tipoPessoa,
        nome,
        dados_fiscais: dadosFiscais,
        ativo: true,
        permite_pagamento_frente_caixa: parseBoolean(req.body?.permite_pagamento_frente_caixa),
      });

      return res.status(201).json(sanitizeCliente(cliente));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao criar cliente de convênio.', detail: error.message });
    }
  },

  async updateCliente(req, res) {
    try {
      const cliente = await findUserCliente(req.user.id, req.params.id);

      if (!cliente) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }

      const hasFiscalPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'dados_fiscais') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'dadosFiscais') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'fiscal') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'emitente');
      const tipoPessoa = Object.prototype.hasOwnProperty.call(req.body || {}, 'tipo_pessoa')
        ? resolveTipoPessoa(req.body?.tipo_pessoa)
        : resolveTipoPessoa(cliente.tipo_pessoa);
      const dadosFiscais = tipoPessoa === 'juridica'
        ? sanitizeFiscalData(hasFiscalPayload ? resolveFiscalSource(req.body) : cliente.dados_fiscais)
        : null;
      const nome = resolveClienteNome(tipoPessoa, req.body, dadosFiscais) || normalizeText(cliente.nome, 160);

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe o nome do cliente.' });
      }

      if (tipoPessoa === 'juridica') {
        const fiscalValidationError = getLegalClientFiscalValidationError(dadosFiscais);

        if (fiscalValidationError) {
          return res.status(400).json({ message: fiscalValidationError });
        }

        const cnpjDuplicate = await findUserClienteCnpjConflict(req.user.id, dadosFiscais.cnpj_cpf, cliente.id);

        if (cnpjDuplicate) {
          return res.status(409).json({
            code: 'CLIENTE_CONVENIO_CNPJ_DUPLICADO',
            message: 'Já existe um cliente pessoa jurídica com esse CNPJ.',
          });
        }
      }

      const duplicate = await findUserClienteNameConflict(req.user.id, nome, cliente.id);

      if (duplicate) {
        return res.status(409).json({
          code: 'CLIENTE_CONVENIO_NOME_DUPLICADO',
          message: 'Já existe um cliente com esse nome.',
        });
      }

      const updates = {
        tipo_pessoa: tipoPessoa,
        nome,
        dados_fiscais: dadosFiscais,
      };

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'permite_pagamento_frente_caixa')) {
        updates.permite_pagamento_frente_caixa = parseBoolean(req.body?.permite_pagamento_frente_caixa);
      }

      await cliente.update(updates);
      const registrosVinculados = await getClienteRegistrosVinculados(req.user.id, cliente.id);

      return res.json(sanitizeCliente(cliente, { registros_vinculados: registrosVinculados }));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao atualizar cliente de convênio.', detail: error.message });
    }
  },

  async deleteCliente(req, res) {
    try {
      const cliente = await findUserCliente(req.user.id, req.params.id);

      if (!cliente) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }

      const registrosVinculados = await getClienteRegistrosVinculados(req.user.id, cliente.id);

      if (registrosVinculados > 0) {
        await cliente.update({ ativo: false });

        return res.json({
          action: 'deactivated',
          cliente: sanitizeCliente(cliente, { registros_vinculados: registrosVinculados }),
          message: 'Cliente desativado para preservar os registros vinculados.',
        });
      }

      await cliente.destroy();

      return res.json({
        action: 'deleted',
        id: cliente.id,
        message: 'Cliente excluído.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao remover cliente de convênio.', detail: error.message });
    }
  },

  async activateCliente(req, res) {
    try {
      const cliente = await findUserCliente(req.user.id, req.params.id);

      if (!cliente) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }

      if (cliente.ativo) {
        const registrosVinculados = await getClienteRegistrosVinculados(req.user.id, cliente.id);
        return res.json(sanitizeCliente(cliente, { registros_vinculados: registrosVinculados }));
      }

      const duplicate = await findUserClienteNameConflict(req.user.id, cliente.nome, cliente.id);

      if (duplicate) {
        return res.status(409).json({
          code: 'CLIENTE_CONVENIO_NOME_DUPLICADO',
          message: 'Já existe um cliente ativo com esse nome.',
        });
      }

      if (resolveTipoPessoa(cliente.tipo_pessoa) === 'juridica') {
        const dadosFiscais = sanitizeFiscalData(cliente.dados_fiscais);
        const cnpjDuplicate = await findUserClienteCnpjConflict(req.user.id, dadosFiscais.cnpj_cpf, cliente.id);

        if (cnpjDuplicate) {
          return res.status(409).json({
            code: 'CLIENTE_CONVENIO_CNPJ_DUPLICADO',
            message: 'Já existe um cliente pessoa jurídica ativo com esse CNPJ.',
          });
        }
      }

      await cliente.update({ ativo: true });
      const registrosVinculados = await getClienteRegistrosVinculados(req.user.id, cliente.id);

      return res.json({
        action: 'activated',
        cliente: sanitizeCliente(cliente, { registros_vinculados: registrosVinculados }),
        message: 'Cliente ativado.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao ativar cliente de convênio.', detail: error.message });
    }
  },

  async listRecebimentos(req, res) {
    try {
      const vendas = await Venda.findAll({
        where: {
          usuario_id: req.user.id,
          situacao: {
            [Op.notIn]: ['cancelada', 'cancelled', 'canceled'],
          },
          [Op.or]: [
            { metodo_pagamento: 'convenio' },
            { situacao: 'convenio' },
            { status_convenio: { [Op.in]: ['pendente', 'pago'] } },
          ],
        },
        include: [
          {
            model: ClienteConvenio,
            as: 'cliente_convenio',
            required: false,
          },
          {
            model: Caixa,
            as: 'caixa',
            required: false,
          },
          {
            model: Caixa,
            as: 'caixa_recebimento',
            required: false,
          },
        ],
        order: [
          ['registrado_em', 'DESC'],
          ['created_at', 'DESC'],
        ],
      });
      const recebimentos = vendas.map(sanitizeRecebimento);

      return res.json({
        recebimentos,
        resumo: {
          pendentes: recebimentos.filter(recebimento => recebimento.status_convenio === 'pendente').length,
          pagos: recebimentos.filter(recebimento => recebimento.status_convenio === 'pago').length,
          total_pendente_centavos: recebimentos
            .filter(recebimento => recebimento.status_convenio === 'pendente')
            .reduce((total, recebimento) => total + recebimento.total_centavos, 0),
        },
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar recebimentos de convênio.', detail: error.message });
    }
  },

  async confirmarRecebimento(req, res) {
    try {
      const venda = await findUserRecebimento(req.user.id, req.params.vendaId);

      if (!venda) {
        return res.status(404).json({ message: 'Recebimento não encontrado.' });
      }

      if (resolveStatusConvenio(venda) === 'pago') {
        return res.json(sanitizeRecebimento(venda));
      }

      const paymentMethod = normalizeRecebimentoPaymentMethod(
        req.body?.metodo_pagamento_recebimento || req.body?.metodo_pagamento || req.body?.forma_pagamento
      );

      await venda.update({
        status_convenio: 'pago',
        situacao_recebimento: 'baixado_painel',
        metodo_pagamento_recebimento: paymentMethod,
        recebido_em: new Date(),
      });

      const updated = await findUserRecebimento(req.user.id, venda.id);

      return res.json(sanitizeRecebimento(updated));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao confirmar recebimento.', detail: error.message });
    }
  },

  async cancelarRecebimento(req, res) {
    try {
      const venda = await findUserRecebimento(req.user.id, req.params.vendaId);

      if (!venda) {
        return res.status(404).json({ message: 'Recebimento não encontrado.' });
      }

      if (resolveStatusConvenio(venda) === 'pendente') {
        return res.json(sanitizeRecebimento(venda));
      }

      await venda.update({
        status_convenio: 'pendente',
        situacao_recebimento: 'pendente',
        metodo_pagamento_recebimento: null,
        caixa_recebimento_id: null,
        recebido_em: null,
      });

      const updated = await findUserRecebimento(req.user.id, venda.id);

      return res.json(sanitizeRecebimento(updated));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao cancelar recebimento.', detail: error.message });
    }
  },
};
