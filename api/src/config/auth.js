module.exports = {
  secret: process.env.JWT_SECRET || 'dev-secret',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev-admin-secret',
  adminExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '12h',
};
