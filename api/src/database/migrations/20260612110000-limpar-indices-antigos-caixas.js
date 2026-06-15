async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables
    .map(table => (typeof table === 'string' ? table : table?.tableName || table?.name || ''))
    .includes(tableName);
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

module.exports = {
  async up(queryInterface) {
    await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_id_idx');
    await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_situacao_idx');
    await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_fechado_em_idx');
  },

  async down() {},
};
