const fs = require('fs');
const path = require('path');
const { ulid } = require('ulid');

const storageRoot = process.env.ARQUIVOS_STORAGE_DIR
  ? path.resolve(process.env.ARQUIVOS_STORAGE_DIR)
  : path.resolve(__dirname, '..', '..', '..', 'storage', 'arquivos');

const mimeExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['application/pdf', '.pdf'],
  ['application/xml', '.xml'],
  ['text/xml', '.xml'],
  ['application/x-pkcs12', '.pfx'],
  ['application/pkcs12', '.pfx'],
]);

const allowedMimeTypes = new Set(mimeExtensions.keys());
const certificateExtensions = new Set(['.pfx', '.p12']);
const certificateMimeTypes = new Set([
  'application/x-pkcs12',
  'application/pkcs12',
  'application/octet-stream',
]);

function getStorageRoot() {
  return storageRoot;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function getArquivoTipo(mimeType) {
  if (mimeType?.startsWith('image/')) {
    return 'imagem';
  }

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType === 'application/xml' || mimeType === 'text/xml') {
    return 'xml';
  }

  return 'outro';
}

function isCertificateFile(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();

  return certificateExtensions.has(extension) && certificateMimeTypes.has(file.mimetype);
}

function isAllowedUploadFile(file) {
  return allowedMimeTypes.has(file.mimetype) || isCertificateFile(file);
}

function getExtension(file) {
  const mappedExtension = mimeExtensions.get(file.mimetype);
  const originalExtension = path.extname(file.originalname || '').toLowerCase();

  if (isCertificateFile(file)) {
    return originalExtension || mappedExtension || '.pfx';
  }

  return mappedExtension || originalExtension || '.bin';
}

function getArquivoTipoByFile(file) {
  if (isCertificateFile(file)) {
    return 'certificado';
  }

  return getArquivoTipo(file.mimetype);
}

function buildStorageDirectory(usuarioId, mimeType) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const tipo = getArquivoTipo(mimeType);

  return path.join(getStorageRoot(), `usuario-${usuarioId}`, tipo, year, month);
}

function buildStoredFileName(file) {
  return `${ulid().toLowerCase()}${getExtension(file)}`;
}

function toRelativePath(filePath) {
  return path.relative(getStorageRoot(), filePath).split(path.sep).join('/');
}

function toAbsolutePath(relativePath) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/');
  const resolvedPath = path.resolve(getStorageRoot(), normalizedPath);
  const rootPath = getStorageRoot();

  if (resolvedPath !== rootPath && !resolvedPath.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function removePhysicalFile(filePath) {
  if (!filePath) {
    return;
  }

  fs.promises.unlink(filePath).catch(() => null);
}

module.exports = {
  allowedMimeTypes,
  buildStorageDirectory,
  buildStoredFileName,
  ensureDirectory,
  getArquivoTipo,
  getArquivoTipoByFile,
  getStorageRoot,
  isAllowedUploadFile,
  removePhysicalFile,
  toAbsolutePath,
  toRelativePath,
};
