const { Router } = require('express');
const controller = require('../app/controllers/estoqueController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/', controller.snapshot);
router.get('/movimentacoes', controller.movimentacoes);
router.post('/', controller.createEstoque);
router.post('/compras', controller.registrarCompra);
router.post('/acertos', controller.registrarAcerto);
router.post('/transferencias', controller.registrarTransferencia);
router.post('/movimentacoes/lancamentos/:id/reverter', controller.reverterLancamento);
router.post('/movimentacoes/:id/reverter', controller.reverterMovimentacao);
router.put('/saldos', controller.updateSaldo);
router.put('/:id', controller.updateEstoque);
router.delete('/:id', controller.deleteEstoque);

module.exports = router;
