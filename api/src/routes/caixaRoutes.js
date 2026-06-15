const { Router } = require('express');
const controller = require('../app/controllers/caixaController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/conferencia', controller.conferenceSnapshot);
router.get('/conferencia/:caixaId', controller.conferenceDetails);
router.post('/conferencia/:caixaId/reabrir', controller.reopenConference);
router.post('/conferencia/:caixaId', controller.saveConference);

module.exports = router;
