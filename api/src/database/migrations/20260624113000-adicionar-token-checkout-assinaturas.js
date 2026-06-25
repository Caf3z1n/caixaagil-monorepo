async function getTableColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return {};
  }
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(index => index.name === options.name);

  if (!exists) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(index => index.name === indexName);

  if (exists) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (!assinaturas.checkout_token) {
      await queryInterface.addColumn('assinaturas', 'checkout_token', {
        type: Sequelize.STRING(96),
        allowNull: true,
      });
    }

    if (!assinaturas.checkout_token_expira_em) {
      await queryInterface.addColumn('assinaturas', 'checkout_token_expira_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    await addIndexIfMissing(queryInterface, 'assinaturas', ['checkout_token'], {
      name: 'assinaturas_checkout_token_unique',
      unique: true,
    });
  },

  async down(queryInterface) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (assinaturas.checkout_token) {
      await removeIndexIfExists(queryInterface, 'assinaturas', 'assinaturas_checkout_token_unique');
      await queryInterface.removeColumn('assinaturas', 'checkout_token');
    }

    if (assinaturas.checkout_token_expira_em) {
      await queryInterface.removeColumn('assinaturas', 'checkout_token_expira_em');
    }
  },
};
