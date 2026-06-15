const { Router } = require('express');
const controller = require('../app/controllers/contaController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.post('/confirmar-email', controller.confirmEmailChange);

router.use(auth);
router.get('/', controller.show);
router.put('/email', controller.requestEmailChange);
router.put('/senha', controller.updatePassword);

module.exports = router;
