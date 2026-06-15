const { Op } = require('sequelize');
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

function sanitizeCliente(cliente) {
  const data = cliente.get ? cliente.get({ plain: true }) : cliente;

  return {
    id: data.id,
    tipo_pessoa: data.tipo_pessoa || 'fisica',
    nome: data.nome,
    ativo: Boolean(data.ativo),
    permite_pagamento_frente_caixa: Boolean(data.permite_pagamento_frente_caixa),
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
      const clientes = await ClienteConvenio.findAll({
        where: {
          usuario_id: req.user.id,
          ativo: true,
        },
        order: [
          ['nome', 'ASC'],
          ['id', 'ASC'],
        ],
      });

      return res.json({
        clientes: clientes.map(sanitizeCliente),
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar clientes de convênio.', detail: error.message });
    }
  },

  async createCliente(req, res) {
    try {
      const nome = normalizeText(req.body?.nome, 160);

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe o nome do cliente.' });
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
        tipo_pessoa: 'fisica',
        nome,
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

      if (!cliente || !cliente.ativo) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }

      const nome = normalizeText(req.body?.nome, 160);

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe o nome do cliente.' });
      }

      const duplicate = await findUserClienteNameConflict(req.user.id, nome, cliente.id);

      if (duplicate) {
        return res.status(409).json({
          code: 'CLIENTE_CONVENIO_NOME_DUPLICADO',
          message: 'Já existe um cliente com esse nome.',
        });
      }

      const updates = { nome };

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'permite_pagamento_frente_caixa')) {
        updates.permite_pagamento_frente_caixa = parseBoolean(req.body?.permite_pagamento_frente_caixa);
      }

      await cliente.update(updates);

      return res.json(sanitizeCliente(cliente));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao atualizar cliente de convênio.', detail: error.message });
    }
  },

  async deleteCliente(req, res) {
    try {
      const cliente = await findUserCliente(req.user.id, req.params.id);

      if (!cliente || !cliente.ativo) {
        return res.status(404).json({ message: 'Cliente não encontrado.' });
      }

      await cliente.update({ ativo: false });

      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao remover cliente de convênio.', detail: error.message });
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
