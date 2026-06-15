const verificationColumns = [
  'email_verificado_em',
  'token_verificacao_email',
  'token_verificacao_email_expira_em',
];

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('subcontas')) {
      return;
    }

    const subcontas = await queryInterface.describeTable('subcontas');

    for (const column of verificationColumns) {
      if (subcontas[column]) {
        await queryInterface.removeColumn('subcontas', column);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('subcontas')) {
      return;
    }

    const subcontas = await queryInterface.describeTable('subcontas');

    if (!subcontas.email_verificado_em) {
      await queryInterface.addColumn('subcontas', 'email_verificado_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!subcontas.token_verificacao_email) {
      await queryInterface.addColumn('subcontas', 'token_verificacao_email', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!subcontas.token_verificacao_email_expira_em) {
      await queryInterface.addColumn('subcontas', 'token_verificacao_email_expira_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },
};
