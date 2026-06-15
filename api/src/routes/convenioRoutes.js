const { Router } = require('express');
const controller = require('../app/controllers/convenioController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/clientes', controller.listClientes);
router.post('/clientes', controller.createCliente);
router.put('/clientes/:id', controller.updateCliente);
router.delete('/clientes/:id', controller.deleteCliente);
router.get('/recebimentos', controller.listRecebimentos);
router.put('/recebimentos/:vendaId/pagar', controller.confirmarRecebimento);
router.put('/recebimentos/:vendaId/cancelar', controller.cancelarRecebimento);

module.exports = router;
