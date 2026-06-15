const { Router } = require('express');
const controller = require('../app/controllers/assinaturaController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.post('/checkout', controller.createCheckout);
router.get('/:id/status', controller.showStatus);

router.use(auth);
router.get('/', controller.list);
router.post('/gerenciar-checkout', controller.createManagementCheckout);
router.get('/:id/pagamentos', controller.listPayments);

module.exports = router;
