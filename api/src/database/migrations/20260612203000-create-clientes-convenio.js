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
      await queryInterface.createTable('clientes_convenio', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        usuario_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'usuarios',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        tipo_pessoa: {
          type: Sequelize.STRING(16),
          allowNull: false,
          defaultValue: 'fisica',
        },
        nome: {
          type: Sequelize.STRING(160),
          allowNull: false,
        },
        ativo: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

      await addIndexIfMissing(queryInterface, 'clientes_convenio', ['usuario_id', 'ativo'], {
        name: 'clientes_convenio_usuario_ativo_idx',
      });
      await addIndexIfMissing(queryInterface, 'clientes_convenio', ['usuario_id', 'nome'], {
        name: 'clientes_convenio_usuario_nome_idx',
      });
    }

    if (await tableExists(queryInterface, 'vendas')) {
      if (!(await columnExists(queryInterface, 'vendas', 'cliente_convenio_id'))) {
        await queryInterface.addColumn('vendas', 'cliente_convenio_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'clientes_convenio',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        });
      }

      if (!(await columnExists(queryInterface, 'vendas', 'status_convenio'))) {
        await queryInterface.addColumn('vendas', 'status_convenio', {
          type: Sequelize.STRING(20),
          allowNull: true,
        });
      }

      await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'cliente_convenio_id'], {
        name: 'vendas_usuario_cliente_convenio_idx',
      });
      await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'status_convenio'], {
        name: 'vendas_usuario_status_convenio_idx',
      });
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'vendas')) {
      await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_status_convenio_idx');
      await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_cliente_convenio_idx');

      if (await columnExists(queryInterface, 'vendas', 'status_convenio')) {
        await queryInterface.removeColumn('vendas', 'status_convenio');
      }

      if (await columnExists(queryInterface, 'vendas', 'cliente_convenio_id')) {
        await queryInterface.removeColumn('vendas', 'cliente_convenio_id');
      }
    }

    if (await tableExists(queryInterface, 'clientes_convenio')) {
      await queryInterface.dropTable('clientes_convenio');
    }
  },
};
