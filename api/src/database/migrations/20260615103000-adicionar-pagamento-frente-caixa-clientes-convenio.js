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
    if (!(await tableExists(queryInterface, 'clientes_convenio'))) {
      return;
    }

    if (!(await columnExists(queryInterface, 'clientes_convenio', 'permite_pagamento_frente_caixa'))) {
      await queryInterface.addColumn('clientes_convenio', 'permite_pagamento_frente_caixa', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    await addIndexIfMissing(
      queryInterface,
      'clientes_convenio',
      ['usuario_id', 'ativo', 'permite_pagamento_frente_caixa'],
      {
        name: 'clientes_convenio_usuario_frente_caixa_idx',
      }
    );
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'clientes_convenio'))) {
      return;
    }

    await removeIndexIfExists(
      queryInterface,
      'clientes_convenio',
      'clientes_convenio_usuario_frente_caixa_idx'
    );

    if (await columnExists(queryInterface, 'clientes_convenio', 'permite_pagamento_frente_caixa')) {
      await queryInterface.removeColumn('clientes_convenio', 'permite_pagamento_frente_caixa');
    }
  },
};
