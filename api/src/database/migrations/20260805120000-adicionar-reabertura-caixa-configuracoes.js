function normalizeTableName(table) {
  if (typeof table === 'string') {
    return table;
  }

  return table?.tableName || table?.name || '';
}

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();

  return tables.map(normalizeTableName).includes(tableName);
}

async function columnExists(queryInterface, tableName, columnName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const columns = await queryInterface.describeTable(tableName);

  return Boolean(columns[columnName]);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, 'configuracoes', 'reabrir_caixa')) {
      return;
    }

    await queryInterface.addColumn('configuracoes', 'reabrir_caixa', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {
        ativo: false,
      },
    });
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'configuracoes', 'reabrir_caixa')) {
      await queryInterface.removeColumn('configuracoes', 'reabrir_caixa');
    }
  },
};
