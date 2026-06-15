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

    if (!assinaturas.proximo_pagamento_em) {
      await queryInterface.addColumn('assinaturas', 'proximo_pagamento_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (assinaturas.proximo_pagamento_em) {
      await queryInterface.removeColumn('assinaturas', 'proximo_pagamento_em');
    }
  },
};
