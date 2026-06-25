const bcrypt = require('bcryptjs');

const adminEmail = process.env.ADMIN_SEED_EMAIL;
const adminPassword = process.env.ADMIN_SEED_PASSWORD;
const adminName = process.env.ADMIN_SEED_NAME || 'Administrador';

module.exports = {
  async up(queryInterface) {
    if (!adminEmail || !adminPassword) {
      throw new Error('Configure ADMIN_SEED_EMAIL e ADMIN_SEED_PASSWORD antes de executar o seed do admin inicial.');
    }

    const senhaHash = await bcrypt.hash(adminPassword, 10);

    await queryInterface.sequelize.query(
      `
        INSERT INTO admin (nome, email, senha_hash, ativo, created_at, updated_at)
        VALUES (:nome, :email, :senhaHash, true, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET
          nome = EXCLUDED.nome,
          senha_hash = EXCLUDED.senha_hash,
          ativo = true,
          updated_at = NOW();
      `,
      {
        replacements: {
          email: adminEmail,
          nome: adminName,
          senhaHash,
        },
      }
    );
  },

  async down(queryInterface) {
    if (!adminEmail) {
      throw new Error('Configure ADMIN_SEED_EMAIL antes de reverter o seed do admin inicial.');
    }

    await queryInterface.bulkDelete('admin', { email: adminEmail });
  },
};
