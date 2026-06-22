async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const tables = await queryInterface.showAllTables();

  if (!tables.includes(tableName)) {
    return;
  }

  const table = await queryInterface.describeTable(tableName);

  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const tables = await queryInterface.showAllTables();

  if (!tables.includes(tableName)) {
    return;
  }

  const table = await queryInterface.describeTable(tableName);

  if (table[columnName]) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'categorias_produtos', 'ativo', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await addColumnIfMissing(queryInterface, 'estoques', 'ativo', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await removeColumnIfExists(queryInterface, 'estoques', 'ativo');
    await removeColumnIfExists(queryInterface, 'categorias_produtos', 'ativo');
  },
};
