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
    if (!(await tableExists(queryInterface, 'configuracoes'))) {
      return;
    }

    if (!(await columnExists(queryInterface, 'configuracoes', 'lancar_despesas'))) {
      await queryInterface.addColumn('configuracoes', 'lancar_despesas', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          ativo: true,
        },
      });
    }
  },

  async down(queryInterface) {
    if ((await tableExists(queryInterface, 'configuracoes')) && (await columnExists(queryInterface, 'configuracoes', 'lancar_despesas'))) {
      await queryInterface.removeColumn('configuracoes', 'lancar_despesas');
    }
  },
};
