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

async function getTableColumns(queryInterface, tableName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return {};
  }

  return queryInterface.describeTable(tableName);
}

async function columnExists(queryInterface, tableName, columnName) {
  const columns = await getTableColumns(queryInterface, tableName);

  return Boolean(columns[columnName]);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'clientes_convenio'))) {
      return;
    }

    if (!(await columnExists(queryInterface, 'clientes_convenio', 'dados_fiscais'))) {
      await queryInterface.addColumn('clientes_convenio', 'dados_fiscais', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'clientes_convenio'))) {
      return;
    }

    if (await columnExists(queryInterface, 'clientes_convenio', 'dados_fiscais')) {
      await queryInterface.removeColumn('clientes_convenio', 'dados_fiscais');
    }
  },
};
