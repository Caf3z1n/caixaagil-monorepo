const { Router } = require('express');
const mercadoPagoWebhookController = require('../app/controllers/mercadoPagoWebhookController');

const router = Router();

router.post('/mercado-pago', mercadoPagoWebhookController.receive);

module.exports = router;
