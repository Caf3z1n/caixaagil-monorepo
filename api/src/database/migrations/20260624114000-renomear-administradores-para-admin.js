async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
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
  if (!(await indexExists(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

module.exports = {
  async up(queryInterface) {
    const hasAdmin = await tableExists(queryInterface, 'admin');
    const hasAdministradores = await tableExists(queryInterface, 'administradores');

    if (!hasAdmin && hasAdministradores) {
      await queryInterface.renameTable('administradores', 'admin');
    }

    if (await tableExists(queryInterface, 'admin')) {
      await removeIndexIfExists(queryInterface, 'admin', 'administradores_email_unique');
      await addIndexIfMissing(queryInterface, 'admin', ['email'], {
        name: 'admin_email_unique',
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const hasAdmin = await tableExists(queryInterface, 'admin');
    const hasAdministradores = await tableExists(queryInterface, 'administradores');

    if (hasAdmin && !hasAdministradores) {
      await removeIndexIfExists(queryInterface, 'admin', 'admin_email_unique');
      await queryInterface.renameTable('admin', 'administradores');
      await addIndexIfMissing(queryInterface, 'administradores', ['email'], {
        name: 'administradores_email_unique',
        unique: true,
      });
    }
  },
};
