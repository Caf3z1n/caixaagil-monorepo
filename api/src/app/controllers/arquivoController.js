const fs = require('fs');
const path = require('path');
const { Arquivo } = require('../models');
const {
  getArquivoTipoByFile,
  removePhysicalFile,
  toAbsolutePath,
  toRelativePath,
} = require('../services/fileStorageService');

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function getArquivoPublicUrl(arquivo) {
  const data = arquivo.get ? arquivo.get({ plain: true }) : arquivo;

  if (data.visibilidade !== 'publico') {
    return null;
  }

  return `/arquivos/publicos/${data.id}`;
}

function getSafeHeaderFilename(value) {
  return String(value || 'arquivo')
    .replace(/[\r\n"]/g, '')
    .trim()
    .slice(0, 180) || 'arquivo';
}

function sanitizeArquivo(arquivo) {
  const data = arquivo.get ? arquivo.get({ plain: true }) : arquivo;

  return {
    id: data.id,
    nome_original: data.nome_original,
    mime_type: data.mime_type,
    extensao: data.extensao,
    tamanho_bytes: Number(data.tamanho_bytes || 0),
    tipo: data.tipo,
    contexto: data.contexto,
    visibilidade: data.visibilidade,
    url: getArquivoPublicUrl(data),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

function getSubaccountPermissions(req) {
  return Array.isArray(req.user?.permissoes) ? req.user.permissoes : [];
}

function canSubaccountAccessArquivo(req, arquivo) {
  if (req.user?.tipo_conta !== 'subconta') {
    return true;
  }

  const permissions = getSubaccountPermissions(req);

  if (permissions.includes('*')) {
    return true;
  }

  const contexto = normalizeText(arquivo.contexto, 60);

  if (permissions.includes('produtos') && contexto === 'produto_imagem') {
    return true;
  }

  if (permissions.includes('documentos_fiscais') && contexto.startsWith('nf_')) {
    return true;
  }

  return false;
}

function sendArquivo(res, arquivo) {
  const absolutePath = toAbsolutePath(arquivo.caminho_relativo);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: 'Arquivo não encontrado.' });
  }

  res.setHeader('Content-Type', arquivo.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${getSafeHeaderFilename(arquivo.nome_original)}"`);

  if (arquivo.visibilidade === 'publico') {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  return res.sendFile(absolutePath);
}

module.exports = {
  async create(req, res) {
    if (!req.file) {
      return res.status(400).json({ message: 'Envie um arquivo para continuar.' });
    }

    try {
      const tipo = getArquivoTipoByFile(req.file);
      const requestedVisibility = req.body?.visibilidade === 'publico' ? 'publico' : 'privado';
      const visibilidade = requestedVisibility === 'publico' && tipo === 'imagem'
        ? 'publico'
        : 'privado';
      const contexto = normalizeText(req.body?.contexto, 60) || null;

      if (contexto === 'certificado_fiscal' && req.user.tipo_conta !== 'usuario') {
        removePhysicalFile(req.file.path);

        return res.status(403).json({
          code: 'MAIN_ACCOUNT_REQUIRED',
          message: 'O certificado fiscal exige acesso pela conta principal.',
        });
      }

      if (req.user.tipo_conta === 'subconta' && contexto !== 'produto_imagem') {
        removePhysicalFile(req.file.path);

        return res.status(403).json({
          code: 'ACCESS_DENIED',
          message: 'Esta subconta não tem acesso para enviar este arquivo.',
        });
      }

      const caminhoRelativo = toRelativePath(req.file.path);
      const extensao = path.extname(req.file.filename).replace('.', '').toLowerCase() || 'bin';

      const arquivo = await Arquivo.create({
        usuario_id: req.user.id,
        nome_original: normalizeText(req.file.originalname, 255) || req.file.filename,
        nome_armazenado: req.file.filename,
        mime_type: req.file.mimetype,
        extensao,
        tamanho_bytes: req.file.size,
        tipo,
        contexto,
        visibilidade,
        caminho_relativo: caminhoRelativo,
        metadados: {
          encoding: req.file.encoding,
          field_name: req.file.fieldname,
        },
      });

      return res.status(201).json(sanitizeArquivo(arquivo));
    } catch (error) {
      removePhysicalFile(req.file.path);

      return res.status(500).json({
        message: 'Não foi possível salvar o arquivo.',
        detail: error.message,
      });
    }
  },

  async show(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ message: 'Arquivo não encontrado.' });
    }

    const arquivo = await Arquivo.findOne({
      where: {
        id,
        usuario_id: req.user.id,
      },
    });

    if (!arquivo) {
      return res.status(404).json({ message: 'Arquivo não encontrado.' });
    }

    if (!canSubaccountAccessArquivo(req, arquivo)) {
      return res.status(403).json({
        code: 'ACCESS_DENIED',
        message: 'Esta subconta não tem acesso a este arquivo.',
      });
    }

    return sendArquivo(res, arquivo);
  },

  async showPublic(req, res) {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ message: 'Arquivo não encontrado.' });
    }

    const arquivo = await Arquivo.findOne({
      where: {
        id,
        visibilidade: 'publico',
      },
    });

    if (!arquivo) {
      return res.status(404).json({ message: 'Arquivo não encontrado.' });
    }

    return sendArquivo(res, arquivo);
  },

  sanitizeArquivo,
  getArquivoPublicUrl,
};
