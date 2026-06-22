const { Router } = require('express');
const controller = require('../app/controllers/produtoController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/', controller.snapshot);
router.post('/categorias', controller.createCategoria);
router.put('/categorias/ordem', controller.reorderCategorias);
router.post('/categorias/:id/ativar', controller.activateCategoria);
router.put('/categorias/:id', controller.updateCategoria);
router.delete('/categorias/:id', controller.deleteCategoria);
router.post('/', controller.createProduto);
router.post('/:id/ativar', controller.activateProduto);
router.put('/:id', controller.updateProduto);
router.delete('/:id', controller.deleteProduto);

module.exports = router;
