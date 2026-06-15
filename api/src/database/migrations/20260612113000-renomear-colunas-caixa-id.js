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

async function renameColumnIfNeeded(queryInterface, tableName, oldName, newName) {
  const columns = await getTableColumns(queryInterface, tableName);

  if (columns[oldName] && !columns[newName]) {
    await queryInterface.renameColumn(tableName, oldName, newName);
  }
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some(index => index.name === indexName);
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  if (await indexExists(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  const columns = await getTableColumns(queryInterface, tableName);
  const hasAllFields = fields.every(field => columns[field]);

  if (hasAllFields && !(await indexExists(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

module.exports = {
  async up(queryInterface) {
    await renameColumnIfNeeded(queryInterface, 'vendas', 'sessao_caixa_id', 'caixa_id');
    await renameColumnIfNeeded(
      queryInterface,
      'vendas',
      'sessao_caixa_recebimento_id',
      'caixa_recebimento_id'
    );
    await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_sessao_caixa_idx');
    await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_sessao_recebimento_idx');
    await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'caixa_id'], {
      name: 'vendas_usuario_caixa_idx',
    });
    await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'caixa_recebimento_id'], {
      name: 'vendas_usuario_caixa_recebimento_idx',
    });

    await renameColumnIfNeeded(queryInterface, 'despesas_caixa', 'sessao_caixa_id', 'caixa_id');
    await removeIndexIfExists(queryInterface, 'despesas_caixa', 'despesas_caixa_usuario_sessao_idx');
    await addIndexIfMissing(queryInterface, 'despesas_caixa', ['usuario_id', 'caixa_id'], {
      name: 'despesas_caixa_usuario_caixa_idx',
    });

    await renameColumnIfNeeded(queryInterface, 'conferencias_caixa', 'sessao_caixa_id', 'caixa_id');
    await removeIndexIfExists(
      queryInterface,
      'conferencias_caixa',
      'conferencias_caixa_usuario_sessao_unico'
    );
    await addIndexIfMissing(queryInterface, 'conferencias_caixa', ['usuario_id', 'caixa_id'], {
      name: 'conferencias_caixa_usuario_caixa_unico',
      unique: true,
    });
  },

  async down(queryInterface) {
    await removeIndexIfExists(queryInterface, 'conferencias_caixa', 'conferencias_caixa_usuario_caixa_unico');
    await renameColumnIfNeeded(queryInterface, 'conferencias_caixa', 'caixa_id', 'sessao_caixa_id');
    await addIndexIfMissing(queryInterface, 'conferencias_caixa', ['usuario_id', 'sessao_caixa_id'], {
      name: 'conferencias_caixa_usuario_sessao_unico',
      unique: true,
    });

    await removeIndexIfExists(queryInterface, 'despesas_caixa', 'despesas_caixa_usuario_caixa_idx');
    await renameColumnIfNeeded(queryInterface, 'despesas_caixa', 'caixa_id', 'sessao_caixa_id');
    await addIndexIfMissing(queryInterface, 'despesas_caixa', ['usuario_id', 'sessao_caixa_id'], {
      name: 'despesas_caixa_usuario_sessao_idx',
    });

    await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_caixa_recebimento_idx');
    await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_caixa_idx');
    await renameColumnIfNeeded(
      queryInterface,
      'vendas',
      'caixa_recebimento_id',
      'sessao_caixa_recebimento_id'
    );
    await renameColumnIfNeeded(queryInterface, 'vendas', 'caixa_id', 'sessao_caixa_id');
    await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'sessao_caixa_id'], {
      name: 'vendas_usuario_sessao_caixa_idx',
    });
    await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'sessao_caixa_recebimento_id'], {
      name: 'vendas_usuario_sessao_recebimento_idx',
    });
  },
};
