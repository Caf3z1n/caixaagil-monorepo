const { Router } = require('express');
const controller = require('../app/controllers/pdvController');
const auth = require('../app/middlewares/auth');

const router = Router();

router.post('/parear', controller.pairDesktop);
router.post('/sessao', controller.showDesktopSession);
router.post('/suporte-remoto/config', controller.showRemoteSupportConfig);
router.post('/suporte-remoto/status', controller.updateRemoteSupportStatus);
router.post('/turno/previa', controller.showDesktopShiftPreview);
router.post('/catalogo', controller.showDesktopCatalog);
router.post('/certificado-fiscal', controller.downloadDesktopFiscalCertificate);
router.post('/sync/push', controller.syncDesktopEvents);
router.post('/sync/fiscal', controller.syncDesktopFiscalDocuments);
router.post('/desparear', controller.unpairDesktop);

router.use(auth);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/ativar', controller.activate);
router.get('/:id/suporte-remoto/credenciais', controller.showRemoteSupportCredentials);
router.post('/:id/suporte-remoto/rotacionar', controller.requestRemoteSupportRotation);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/codigo-pareamento', controller.createPairingCode);
router.post('/:id/desvincular', controller.unpair);

module.exports = router;
