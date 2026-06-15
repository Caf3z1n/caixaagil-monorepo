module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('usuarios')) {
      return;
    }

    const usuarios = await queryInterface.describeTable('usuarios');

    if (!usuarios.onboarding_concluido_em) {
      await queryInterface.addColumn('usuarios', 'onboarding_concluido_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (tables.includes('pdvs')) {
      await queryInterface.sequelize.query(`
        UPDATE usuarios
        SET onboarding_concluido_em = CURRENT_TIMESTAMP
        WHERE onboarding_concluido_em IS NULL
          AND EXISTS (
            SELECT 1
            FROM pdvs
            WHERE pdvs.usuario_id = usuarios.id
              AND pdvs.pareado_em IS NOT NULL
          )
      `);
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('usuarios')) {
      return;
    }

    const usuarios = await queryInterface.describeTable('usuarios');

    if (usuarios.onboarding_concluido_em) {
      await queryInterface.removeColumn('usuarios', 'onboarding_concluido_em');
    }
  },
};
