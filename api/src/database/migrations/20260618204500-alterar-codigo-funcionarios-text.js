async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
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
    if (await columnExists(queryInterface, 'funcionarios', 'codigo')) {
      await queryInterface.changeColumn('funcionarios', 'codigo', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    if (await columnExists(queryInterface, 'funcionarios', 'codigo')) {
      await queryInterface.changeColumn('funcionarios', 'codigo', {
        type: Sequelize.STRING(12),
        allowNull: true,
      });
    }
  },
};
