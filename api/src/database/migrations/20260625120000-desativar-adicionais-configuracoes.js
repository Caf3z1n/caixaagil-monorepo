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

async function changeDefault(queryInterface, Sequelize, columnName, ativo) {
  if (!(await columnExists(queryInterface, 'configuracoes', columnName))) {
    return;
  }

  await queryInterface.changeColumn('configuracoes', columnName, {
    type: Sequelize.JSONB,
    allowNull: false,
    defaultValue: {
      ativo,
    },
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await changeDefault(queryInterface, Sequelize, 'comandas', false);
    await changeDefault(queryInterface, Sequelize, 'lancar_despesas', false);
  },

  async down(queryInterface, Sequelize) {
    await changeDefault(queryInterface, Sequelize, 'comandas', true);
    await changeDefault(queryInterface, Sequelize, 'lancar_despesas', true);
  },
};
