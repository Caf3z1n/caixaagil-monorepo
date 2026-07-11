const { Router } = require('express');
const adminController = require('../app/controllers/adminController');
const adminSessionController = require('../app/controllers/adminSessionController');
const adminAuth = require('../app/middlewares/adminAuth');

const router = Router();

router.post('/bootstrap', adminController.bootstrap);
router.post('/sessions', adminSessionController.create);

router.use(adminAuth);
router.get('/me', adminController.me);
router.get('/resumo', adminController.summary);
router.get('/planos', adminController.listPlans);
router.post('/planos', adminController.createPlan);
router.put('/planos/:id', adminController.updatePlan);
router.delete('/planos/:id', adminController.deletePlan);
router.get('/usuarios', adminController.listUsers);
router.get('/usuarios/:id', adminController.showUser);
router.post('/usuarios/:id/acesso-suporte', adminController.createUserSupportAccess);
router.post('/usuarios/:id/verificar-email', adminController.verifyUserEmail);
router.get('/usuarios/:id/pdvs/:pdvId/suporte-remoto/credenciais', adminController.showUserPdvRemoteSupportCredentials);
router.post('/usuarios/:id/assinaturas/:assinaturaId/valor', adminController.updateUserSubscriptionValue);
router.post('/usuarios/:id/assinaturas/:assinaturaId/trial', adminController.grantUserSubscriptionTrial);
router.post('/usuarios/:id/assinaturas/:assinaturaId/status', adminController.updateUserSubscriptionStatus);

module.exports = router;
