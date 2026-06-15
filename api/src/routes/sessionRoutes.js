const { Router } = require('express');
const controller = require('../app/controllers/sessionController');

const router = Router();

router.post('/', controller.create);

module.exports = router;
