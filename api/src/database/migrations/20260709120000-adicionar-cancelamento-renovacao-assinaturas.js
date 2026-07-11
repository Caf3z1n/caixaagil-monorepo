async function getTableColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return {};
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (!assinaturas.renovacao_cancelada_em) {
      await queryInterface.addColumn('assinaturas', 'renovacao_cancelada_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!assinaturas.acesso_ate) {
      await queryInterface.addColumn('assinaturas', 'acesso_ate', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (assinaturas.acesso_ate) {
      await queryInterface.removeColumn('assinaturas', 'acesso_ate');
    }

    if (assinaturas.renovacao_cancelada_em) {
      await queryInterface.removeColumn('assinaturas', 'renovacao_cancelada_em');
    }
  },
};
