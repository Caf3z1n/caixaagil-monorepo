const pdvController = require('./pdvController');

function buildOnboardingStatus(pdvsSnapshot, usuario) {
  const onboardingConcluido = Boolean(usuario?.onboarding_concluido_em) || pdvsSnapshot.ativos > 0;
  const precisaCriarPdv = !onboardingConcluido && pdvsSnapshot.total === 0;
  const precisaAtivarPdv = !onboardingConcluido && pdvsSnapshot.total > 0 && pdvsSnapshot.ativos === 0;
  const etapaAtual = precisaCriarPdv ? 'criar_pdv' : precisaAtivarPdv ? 'ativar_pdv' : 'concluido';

  return {
    precisa_onboarding: !onboardingConcluido && etapaAtual !== 'concluido',
    etapa_atual: etapaAtual,
    pdvs_total: pdvsSnapshot.total,
    pdvs_ativos: pdvsSnapshot.ativos,
    pdvs_pareados: pdvsSnapshot.pareados,
    produtos_total: null,
    primeiro_pdv:
      pdvsSnapshot.pdvs.find(pdv => pdv.status_operacional === 'online') ||
      pdvsSnapshot.pdvs[0] ||
      null,
    etapas: [
      {
        id: 'criar_pdv',
        titulo: 'Criar primeiro PDV',
        obrigatoria: true,
        concluida: !precisaCriarPdv,
      },
      {
        id: 'ativar_pdv',
        titulo: 'Ativar no desktop',
        obrigatoria: true,
        concluida: onboardingConcluido || pdvsSnapshot.ativos > 0,
      },
      {
        id: 'produtos',
        titulo: 'Cadastrar produtos',
        obrigatoria: false,
        concluida: false,
        disponivel: false,
      },
    ],
  };
}

module.exports = {
  async show(req, res) {
    try {
      const pdvsSnapshot = await pdvController.getUserPdvsSnapshot(req.user.id);

      return res.json(buildOnboardingStatus(pdvsSnapshot, req.user));
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao consultar configuração inicial.',
        detail: error.message,
      });
    }
  },
};
