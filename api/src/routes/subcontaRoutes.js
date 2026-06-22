const { Router } = require('express');
const controller = require('../app/controllers/subcontaController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/permissoes', controller.permissions);
router.post('/identificar', controller.identify);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id/dados', controller.updateData);
router.put('/:id/senha', controller.updatePassword);
router.put('/:id/permissoes', controller.updatePermissions);
router.post('/:id/ativar', controller.activate);
router.delete('/:id', controller.remove);

module.exports = router;
