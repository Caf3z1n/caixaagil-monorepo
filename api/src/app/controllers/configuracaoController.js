const configuracaoSistemaService = require('../services/configuracaoSistemaService');

function handleConfiguracaoError(res, error, defaultMessage) {
  if (error.status) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
    });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
}

module.exports = {
  async show(req, res) {
    try {
      const configuracao = await configuracaoSistemaService.getConfiguracaoSnapshot(req.user.id);

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao carregar configurações.');
    }
  },

  async updatePaymentMethods(req, res) {
    try {
      const formasPagamento = req.body?.formas_pagamento ?? req.body;
      const configuracao = await configuracaoSistemaService.updatePaymentMethods(req.user.id, formasPagamento);

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao atualizar formas de pagamento.');
    }
  },
};
