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
  async up(queryInterface) {
    if (!(await columnExists(queryInterface, 'despesas_caixa', 'caixa_id'))) {
      return;
    }

    await queryInterface.sequelize.query('ALTER TABLE "despesas_caixa" ALTER COLUMN "caixa_id" DROP NOT NULL');
  },

  async down(queryInterface) {
    if (!(await columnExists(queryInterface, 'despesas_caixa', 'caixa_id'))) {
      return;
    }

    await queryInterface.bulkDelete('despesas_caixa', { caixa_id: null }, {});
    await queryInterface.sequelize.query('ALTER TABLE "despesas_caixa" ALTER COLUMN "caixa_id" SET NOT NULL');
  },
};
