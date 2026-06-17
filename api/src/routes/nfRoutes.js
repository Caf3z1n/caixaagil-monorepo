const { Router } = require('express');
const controller = require('../app/controllers/nfController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.show);
router.put('/:id/status', controller.updateStatus);

module.exports = router;
