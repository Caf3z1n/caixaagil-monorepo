const { Router } = require('express');
const controller = require('../app/controllers/onboardingController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.use(auth);
router.get('/status', controller.show);

module.exports = router;
