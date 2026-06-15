const { Router } = require('express');
const controller = require('../app/controllers/usuarioController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.post('/identificar', controller.identify);
router.post('/verificacao-email', controller.sendVerification);
router.post('/confirmar-email', controller.confirmVerification);
router.post('/redefinicao-senha', controller.requestPasswordReset);
router.post('/validar-redefinicao-senha', controller.validatePasswordReset);
router.post('/redefinir-senha', controller.resetPassword);
router.post('/', controller.create);

router.use(auth);
router.get('/', controller.list);
router.get('/:id', controller.show);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
