const { randomUUID } = require('crypto');
const { Caixa, DespesaCaixa, Pdv, Usuario } = require('../models');

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

function sanitizeCaixaReferencia(caixa) {
  if (!caixa) {
    return null;
  }

  const data = caixa.get ? caixa.get({ plain: true }) : caixa;

  return {
    id: data.id || null,
    data_operacao_chave: data.data_operacao_chave || null,
    data_operacao_rotulo: data.data_operacao_rotulo || null,
    numero_turno: Number(data.numero_turno || 0) || null,
    situacao: data.situacao || null,
    aberto_em: toIso(data.aberto_em),
    fechado_em: toIso(data.fechado_em),
  };
}

function sanitizePdvReferencia(pdv) {
  if (!pdv) {
    return null;
  }

  const data = pdv.get ? pdv.get({ plain: true }) : pdv;

  return {
    id: data.id || null,
    nome: data.nome || null,
  };
}

function resolveOrigem(data) {
  const origem = normalizeKey(data.origem);

  if (origem === 'administrativa') {
    return 'administrativa';
  }

  if (!data.caixa_id) {
    return 'administrativa';
  }

  return 'pdv';
}

function sanitizeDespesa(despesa) {
  const data = despesa.get ? despesa.get({ plain: true }) : despesa;
  const origem = resolveOrigem(data);
  const ownerEmail = normalizeText(data.usuario?.email, 160) || null;
  const lancadoPorEmail = normalizeText(data.lancado_por_email, 160) || (origem === 'administrativa' ? ownerEmail : null);

  return {
    id: data.id,
    descricao: data.descricao,
    valor_centavos: sanitizeCents(data.valor_centavos),
    origem,
    lancado_por_email: lancadoPorEmail,
    lancado_por_tipo: data.lancado_por_tipo || (lancadoPorEmail ? 'usuario' : null),
    lancado_por_subconta_id: data.lancado_por_subconta_id || null,
    pdv_id: data.pdv_id || null,
    caixa_id: data.caixa_id || null,
    caixa: sanitizeCaixaReferencia(data.caixa),
    pdv: sanitizePdvReferencia(data.pdv),
    registrado_em: toIso(data.registrado_em),
    created_at: toIso(data.created_at || data.createdAt),
    updated_at: toIso(data.updated_at || data.updatedAt),
  };
}

async function findUserDespesa(usuarioId, id) {
  const despesaId = normalizeText(id, 64);

  if (!despesaId) {
    return null;
  }

  return DespesaCaixa.findOne({
    where: {
      id: despesaId,
      usuario_id: usuarioId,
    },
    include: [
      {
        model: Caixa,
        as: 'caixa',
        required: false,
      },
      {
        model: Pdv,
        as: 'pdv',
        required: false,
      },
      {
        model: Usuario,
        as: 'usuario',
        required: false,
        attributes: ['id', 'email'],
      },
    ],
  });
}

function getActorEmail(req) {
  return normalizeText(req.user?.email_acesso || req.user?.email, 160);
}

function getActorType(req) {
  return req.user?.tipo_conta === 'subconta' ? 'subconta' : 'usuario';
}

module.exports = {
  async list(req, res) {
    try {
      const despesas = await DespesaCaixa.findAll({
        where: {
          usuario_id: req.user.id,
        },
        include: [
          {
            model: Caixa,
            as: 'caixa',
            required: false,
          },
          {
            model: Pdv,
            as: 'pdv',
            required: false,
          },
          {
            model: Usuario,
            as: 'usuario',
            required: false,
            attributes: ['id', 'email'],
          },
        ],
        order: [
          ['registrado_em', 'DESC'],
          ['created_at', 'DESC'],
        ],
      });
      const sanitizedDespesas = despesas.map(sanitizeDespesa);

      return res.json({
        despesas: sanitizedDespesas,
        resumo: {
          total_centavos: sanitizedDespesas.reduce((total, despesa) => total + despesa.valor_centavos, 0),
          administrativas: sanitizedDespesas.filter(despesa => despesa.origem === 'administrativa').length,
          pdv: sanitizedDespesas.filter(despesa => despesa.origem === 'pdv').length,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar despesas.', detail: error.message });
    }
  },

  async create(req, res) {
    try {
      const descricao = normalizeText(req.body?.descricao || req.body?.title, 160);
      const valorCentavos = sanitizeCents(req.body?.valor_centavos || req.body?.amountCents);

      if (descricao.length < 2) {
        return res.status(400).json({ message: 'Informe a descrição da despesa.' });
      }

      if (valorCentavos <= 0) {
        return res.status(400).json({ message: 'Informe o valor da despesa.' });
      }

      const despesa = await DespesaCaixa.create({
        id: `despesa-admin-${randomUUID()}`,
        usuario_id: req.user.id,
        pdv_id: null,
        dispositivo_id: null,
        caixa_id: null,
        origem: 'administrativa',
        lancado_por_email: getActorEmail(req) || null,
        lancado_por_tipo: getActorType(req),
        lancado_por_subconta_id: req.user?.subconta_id || null,
        descricao,
        valor_centavos: valorCentavos,
        registrado_em: new Date(),
      });
      const created = await findUserDespesa(req.user.id, despesa.id);

      return res.status(201).json(sanitizeDespesa(created || despesa));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao lançar despesa.', detail: error.message });
    }
  },

  async update(req, res) {
    try {
      const despesa = await findUserDespesa(req.user.id, req.params.id);

      if (!despesa) {
        return res.status(404).json({ message: 'Despesa não encontrada.' });
      }

      const descricao = normalizeText(req.body?.descricao || req.body?.title, 160);
      const valorCentavos = sanitizeCents(req.body?.valor_centavos || req.body?.amountCents);

      if (descricao.length < 2) {
        return res.status(400).json({ message: 'Informe a descrição da despesa.' });
      }

      if (valorCentavos <= 0) {
        return res.status(400).json({ message: 'Informe o valor da despesa.' });
      }

      await despesa.update({
        descricao,
        valor_centavos: valorCentavos,
        origem: resolveOrigem(despesa),
      });

      const updated = await findUserDespesa(req.user.id, despesa.id);

      return res.json(sanitizeDespesa(updated || despesa));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao atualizar despesa.', detail: error.message });
    }
  },

  async delete(req, res) {
    try {
      const despesa = await findUserDespesa(req.user.id, req.params.id);

      if (!despesa) {
        return res.status(404).json({ message: 'Despesa não encontrada.' });
      }

      await despesa.destroy();

      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao excluir despesa.', detail: error.message });
    }
  },
};
