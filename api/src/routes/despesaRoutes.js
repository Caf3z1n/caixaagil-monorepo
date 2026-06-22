const { Router } = require('express');
const controller = require('../app/controllers/despesaController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
