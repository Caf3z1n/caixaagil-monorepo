const { Router } = require('express');
const sessionRoutes = require('./sessionRoutes');
const usuarioRoutes = require('./usuarioRoutes');
const assinaturaRoutes = require('./assinaturaRoutes');
const contaRoutes = require('./contaRoutes');
const webhookRoutes = require('./webhookRoutes');
const pdvRoutes = require('./pdvRoutes');
const onboardingRoutes = require('./onboardingRoutes');
const subcontaRoutes = require('./subcontaRoutes');
const grupoFiscalRoutes = require('./grupoFiscalRoutes');
const produtoRoutes = require('./produtoRoutes');
const arquivoRoutes = require('./arquivoRoutes');
const estoqueRoutes = require('./estoqueRoutes');
const caixaRoutes = require('./caixaRoutes');
const configuracaoRoutes = require('./configuracaoRoutes');
const convenioRoutes = require('./convenioRoutes');
const healthController = require('../app/controllers/healthController');

const router = Router();

// ROTAS ABERTAS
router.use('/sessions', sessionRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/assinaturas', assinaturaRoutes);
router.use('/conta', contaRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/pdvs', pdvRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/subcontas', subcontaRoutes);
router.use('/grupos-fiscais', grupoFiscalRoutes);
router.use('/produtos', produtoRoutes);
router.use('/arquivos', arquivoRoutes);
router.use('/estoques', estoqueRoutes);
router.use('/caixa', caixaRoutes);
router.use('/configuracoes', configuracaoRoutes);
router.use('/convenios', convenioRoutes);
router.get('/health', healthController.show);

module.exports = router;
