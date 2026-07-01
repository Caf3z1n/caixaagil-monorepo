async function columnExists(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('pdvs')) {
      return;
    }

    if (!(await columnExists(queryInterface, 'pdvs', 'suporte_remoto'))) {
      await queryInterface.addColumn('pdvs', 'suporte_remoto', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('pdvs')) {
      return;
    }

    if (await columnExists(queryInterface, 'pdvs', 'suporte_remoto')) {
      await queryInterface.removeColumn('pdvs', 'suporte_remoto');
    }
  },
};
