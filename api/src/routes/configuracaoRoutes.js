const { Router } = require('express');
const controller = require('../app/controllers/configuracaoController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/', controller.show);
router.put('/formas-pagamento', controller.updatePaymentMethods);
router.put('/fiscal', controller.updateFiscal);
router.put('/comandas', controller.updateCommands);
router.put('/despesas', controller.updateExpenses);
router.put('/funcionarios', controller.updateEmployees);
router.put('/integracoes', controller.updateIntegrations);
router.get('/integracoes/cnpja/cnpj/:cnpj', controller.lookupCnpj);
router.get('/integracoes/cnpja/cep/:cep', controller.lookupCep);

module.exports = router;
