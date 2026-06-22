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

function caixaReference(Sequelize, allowNull) {
  return {
    type: Sequelize.STRING(64),
    allowNull,
    references: {
      model: 'caixas',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  };
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'despesas_caixa'))) {
      return;
    }

    if (!(await columnExists(queryInterface, 'despesas_caixa', 'origem'))) {
      await queryInterface.addColumn('despesas_caixa', 'origem', {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: 'pdv',
      });
    }

    const columns = await getTableColumns(queryInterface, 'despesas_caixa');

    if (columns.caixa_id && columns.caixa_id.allowNull === false) {
      await queryInterface.changeColumn('despesas_caixa', 'caixa_id', caixaReference(Sequelize, true));
      await queryInterface.sequelize.query('ALTER TABLE "despesas_caixa" ALTER COLUMN "caixa_id" DROP NOT NULL');
    }

    await addIndexIfMissing(queryInterface, 'despesas_caixa', ['usuario_id', 'origem'], {
      name: 'despesas_caixa_usuario_origem_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'despesas_caixa'))) {
      return;
    }

    await removeIndexIfExists(queryInterface, 'despesas_caixa', 'despesas_caixa_usuario_origem_idx');

    if (await columnExists(queryInterface, 'despesas_caixa', 'origem')) {
      await queryInterface.removeColumn('despesas_caixa', 'origem');
    }

    const columns = await getTableColumns(queryInterface, 'despesas_caixa');

    if (columns.caixa_id && columns.caixa_id.allowNull !== false) {
      await queryInterface.bulkDelete('despesas_caixa', { caixa_id: null }, {});
      await queryInterface.changeColumn('despesas_caixa', 'caixa_id', caixaReference(Sequelize, false));
      await queryInterface.sequelize.query('ALTER TABLE "despesas_caixa" ALTER COLUMN "caixa_id" SET NOT NULL');
    }
  },
};
