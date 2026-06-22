const configuracaoSistemaService = require('../services/configuracaoSistemaService');
const cnpjaIntegrationService = require('../services/cnpjaIntegrationService');

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

  async updateFiscal(req, res) {
    try {
      const fiscal = req.body?.fiscal ?? req.body;
      const configuracao = await configuracaoSistemaService.updateFiscalSettings(req.user.id, fiscal);

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao atualizar configuração fiscal.');
    }
  },

  async updateCommands(req, res) {
    try {
      const comandas = req.body?.comandas ?? req.body;
      const configuracao = await configuracaoSistemaService.updateCommandSettings(req.user.id, comandas);

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao atualizar configuração de comandas.');
    }
  },

  async updateExpenses(req, res) {
    try {
      const lancarDespesas = req.body?.lancar_despesas ?? req.body?.despesas ?? req.body;
      const configuracao = await configuracaoSistemaService.updateExpenseSettings(req.user.id, lancarDespesas);

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao atualizar configuração de despesas.');
    }
  },

  async updateEmployees(req, res) {
    try {
      const controleFuncionarios = req.body?.controle_funcionarios ?? req.body?.funcionarios ?? req.body;
      const configuracao = await configuracaoSistemaService.updateEmployeeControlSettings(
        req.user.id,
        controleFuncionarios
      );

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao atualizar configuraÃ§Ã£o de funcionÃ¡rios.');
    }
  },

  async updateIntegrations(req, res) {
    try {
      const integracoes = req.body?.integracoes ?? req.body;
      const configuracao = await configuracaoSistemaService.updateIntegrationSettings(req.user.id, integracoes);

      return res.json(configuracao);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao atualizar integrações.');
    }
  },

  async lookupCnpj(req, res) {
    try {
      const resultado = await cnpjaIntegrationService.lookupCnpj(req.user.id, req.params.cnpj);

      return res.json(resultado);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao consultar CNPJ.');
    }
  },

  async lookupCep(req, res) {
    try {
      const resultado = await cnpjaIntegrationService.lookupCep(req.user.id, req.params.cep);

      return res.json(resultado);
    } catch (error) {
      return handleConfiguracaoError(res, error, 'Erro ao consultar CEP.');
    }
  },
};
