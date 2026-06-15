const columns = {
  novo_email_pendente: {
    type: null,
    allowNull: true,
  },
  token_troca_email: {
    type: null,
    allowNull: true,
  },
  token_troca_email_expira_em: {
    type: null,
    allowNull: true,
  },
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('usuarios')) {
      return;
    }

    const usuarios = await queryInterface.describeTable('usuarios');

    if (!usuarios.novo_email_pendente) {
      await queryInterface.addColumn('usuarios', 'novo_email_pendente', {
        ...columns.novo_email_pendente,
        type: Sequelize.STRING,
      });
    }

    if (!usuarios.token_troca_email) {
      await queryInterface.addColumn('usuarios', 'token_troca_email', {
        ...columns.token_troca_email,
        type: Sequelize.STRING,
      });
    }

    if (!usuarios.token_troca_email_expira_em) {
      await queryInterface.addColumn('usuarios', 'token_troca_email_expira_em', {
        ...columns.token_troca_email_expira_em,
        type: Sequelize.DATE,
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('usuarios')) {
      return;
    }

    const usuarios = await queryInterface.describeTable('usuarios');

    if (usuarios.token_troca_email_expira_em) {
      await queryInterface.removeColumn('usuarios', 'token_troca_email_expira_em');
    }

    if (usuarios.token_troca_email) {
      await queryInterface.removeColumn('usuarios', 'token_troca_email');
    }

    if (usuarios.novo_email_pendente) {
      await queryInterface.removeColumn('usuarios', 'novo_email_pendente');
    }
  },
};
