async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();

  return tables.includes(tableName);
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  try {
    await queryInterface.removeIndex(tableName, indexName);
  } catch {
    // Index may not exist when the database was created after the table rename.
  }
}

async function addIndexIfMissing(queryInterface, tableName, indexName) {
  try {
    await queryInterface.addIndex(tableName, ['usuario_id'], {
      unique: true,
      name: indexName,
    });
  } catch {
    // Unique index may already exist with this name.
  }
}

module.exports = {
  async up(queryInterface) {
    const hasOldTable = await tableExists(queryInterface, 'configuracoes_sistema');
    const hasNewTable = await tableExists(queryInterface, 'configuracoes');

    if (hasOldTable && !hasNewTable) {
      await queryInterface.renameTable('configuracoes_sistema', 'configuracoes');
      await removeIndexIfExists(queryInterface, 'configuracoes', 'configuracoes_sistema_usuario_id_unique');
      await addIndexIfMissing(queryInterface, 'configuracoes', 'configuracoes_usuario_id_unique');
    }
  },

  async down(queryInterface) {
    const hasOldTable = await tableExists(queryInterface, 'configuracoes_sistema');
    const hasNewTable = await tableExists(queryInterface, 'configuracoes');

    if (hasNewTable && !hasOldTable) {
      await queryInterface.renameTable('configuracoes', 'configuracoes_sistema');
      await removeIndexIfExists(queryInterface, 'configuracoes_sistema', 'configuracoes_usuario_id_unique');
      await addIndexIfMissing(
        queryInterface,
        'configuracoes_sistema',
        'configuracoes_sistema_usuario_id_unique'
      );
    }
  },
};
