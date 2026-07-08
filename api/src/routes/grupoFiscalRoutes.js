const { Router } = require('express');
const controller = require('../app/controllers/grupoFiscalController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/configuracao', controller.showFiscalConfiguration);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/ativar', controller.activate);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
