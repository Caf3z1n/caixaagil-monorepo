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

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await getTableColumns(queryInterface, tableName);

  if (!columns[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const columns = await getTableColumns(queryInterface, tableName);

  if (columns[columnName]) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some(index => index.name === indexName);
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  if (!(await indexExists(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  if (await indexExists(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'despesas_caixa'))) {
      return;
    }

    await addColumnIfMissing(queryInterface, 'despesas_caixa', 'lancado_por_email', {
      type: Sequelize.STRING(160),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'despesas_caixa', 'lancado_por_tipo', {
      type: Sequelize.STRING(24),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'despesas_caixa', 'lancado_por_subconta_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'subcontas',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await addIndexIfMissing(queryInterface, 'despesas_caixa', ['usuario_id', 'lancado_por_email'], {
      name: 'despesas_caixa_usuario_lancado_por_email_idx',
    });
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'despesas_caixa'))) {
      return;
    }

    await removeIndexIfExists(queryInterface, 'despesas_caixa', 'despesas_caixa_usuario_lancado_por_email_idx');
    await removeColumnIfExists(queryInterface, 'despesas_caixa', 'lancado_por_subconta_id');
    await removeColumnIfExists(queryInterface, 'despesas_caixa', 'lancado_por_tipo');
    await removeColumnIfExists(queryInterface, 'despesas_caixa', 'lancado_por_email');
  },
};
