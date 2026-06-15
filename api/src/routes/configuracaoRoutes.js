const { Router } = require('express');
const controller = require('../app/controllers/configuracaoController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/', controller.show);
router.put('/formas-pagamento', controller.updatePaymentMethods);

module.exports = router;
