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

async function addColumnIfMissing(queryInterface, Sequelize, tableName, columnName, definition) {
  if (await columnExists(queryInterface, tableName, columnName)) {
    return;
  }

  await queryInterface.addColumn(tableName, columnName, definition(Sequelize));
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  if (!(await columnExists(queryInterface, tableName, columnName))) {
    return;
  }

  await queryInterface.removeColumn(tableName, columnName);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, Sequelize, 'pagamentos_assinaturas', 'tipo_pagamento', DataTypes => ({
      type: DataTypes.STRING,
      allowNull: true,
    }));

    await addColumnIfMissing(queryInterface, Sequelize, 'pagamentos_assinaturas', 'cartao_bandeira', DataTypes => ({
      type: DataTypes.STRING,
      allowNull: true,
    }));

    await addColumnIfMissing(queryInterface, Sequelize, 'pagamentos_assinaturas', 'cartao_ultimos_digitos', DataTypes => ({
      type: DataTypes.STRING(4),
      allowNull: true,
    }));
  },

  async down(queryInterface) {
    await removeColumnIfExists(queryInterface, 'pagamentos_assinaturas', 'cartao_ultimos_digitos');
    await removeColumnIfExists(queryInterface, 'pagamentos_assinaturas', 'cartao_bandeira');
    await removeColumnIfExists(queryInterface, 'pagamentos_assinaturas', 'tipo_pagamento');
  },
};
