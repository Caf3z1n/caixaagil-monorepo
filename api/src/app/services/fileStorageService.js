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
]);

const allowedMimeTypes = new Set(mimeExtensions.keys());

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

function getExtension(file) {
  const mappedExtension = mimeExtensions.get(file.mimetype);
  const originalExtension = path.extname(file.originalname || '').toLowerCase();

  return mappedExtension || originalExtension || '.bin';
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
  getStorageRoot,
  removePhysicalFile,
  toAbsolutePath,
  toRelativePath,
};
