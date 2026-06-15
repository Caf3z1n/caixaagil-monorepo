const { Router } = require('express');
const controller = require('../app/controllers/arquivoController');
const uploadArquivo = require('../app/middlewares/uploadArquivo');
const auth = require('../app/middlewares/auth');

const router = Router();

router.get('/publicos/:id', controller.showPublic);

router.use(auth);
router.post('/', uploadArquivo, controller.create);
router.get('/:id', controller.show);

module.exports = router;
