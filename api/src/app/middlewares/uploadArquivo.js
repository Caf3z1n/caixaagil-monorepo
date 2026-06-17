const multer = require('multer');
const {
  buildStorageDirectory,
  buildStoredFileName,
  ensureDirectory,
  isAllowedUploadFile,
} = require('../services/fileStorageService');

const maxFileSizeMb = Number(process.env.ARQUIVOS_MAX_MB || 12);

const upload = multer({
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
  storage: multer.diskStorage({
    destination(req, file, callback) {
      const directory = buildStorageDirectory(req.user.id, file.mimetype);

      ensureDirectory(directory);
      callback(null, directory);
    },
    filename(_req, file, callback) {
      callback(null, buildStoredFileName(file));
    },
  }),
  fileFilter(_req, file, callback) {
    if (!isAllowedUploadFile(file)) {
      callback(new Error('Tipo de arquivo não permitido.'));
      return;
    }

    callback(null, true);
  },
});

module.exports = function uploadArquivo(req, res, next) {
  upload.single('arquivo')(req, res, error => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: `Arquivo muito grande. Envie arquivos de até ${maxFileSizeMb} MB.`,
      });
    }

    return res.status(400).json({
      message: error.message || 'Não foi possível receber o arquivo.',
    });
  });
};
