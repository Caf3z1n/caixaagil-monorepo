async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
}

async function columnExists(queryInterface, tableName, columnName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const columns = await queryInterface.describeTable(tableName);
  return Boolean(columns[columnName]);
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  if (!(await columnExists(queryInterface, tableName, columnName))) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  if (await columnExists(queryInterface, tableName, columnName)) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  if (!(await tableExists(queryInterface, tableName))) {
    return;
  }

  const indexes = await queryInterface.showIndex(tableName);
  const indexName = options?.name;

  if (indexName && indexes.some(index => index.name === indexName)) {
    return;
  }

  await queryInterface.addIndex(tableName, fields, options);
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return;
  }

  const indexes = await queryInterface.showIndex(tableName);

  if (indexes.some(index => index.name === indexName)) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'configuracoes')) {
      await addColumnIfMissing(queryInterface, 'configuracoes', 'controle_funcionarios', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          ativo: false,
        },
      });
    }

    if (!(await tableExists(queryInterface, 'funcionarios'))) {
      await queryInterface.createTable('funcionarios', {
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
        nome: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        codigo_hash: {
          type: Sequelize.STRING(128),
          allowNull: false,
        },
        codigo: {
          type: Sequelize.TEXT,
          allowNull: true,
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
    }

    await addIndexIfMissing(queryInterface, 'funcionarios', ['usuario_id', 'ativo'], {
      name: 'funcionarios_usuario_ativo_idx',
    });
    await addIndexIfMissing(queryInterface, 'funcionarios', ['usuario_id', 'nome'], {
      name: 'funcionarios_usuario_nome_idx',
    });
    await addIndexIfMissing(queryInterface, 'funcionarios', ['usuario_id', 'codigo_hash'], {
      unique: true,
      where: {
        ativo: true,
      },
      name: 'funcionarios_usuario_codigo_hash_unico',
    });

    if (await tableExists(queryInterface, 'caixas')) {
      await addColumnIfMissing(queryInterface, 'caixas', 'funcionario_fechamento_id', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
      await addColumnIfMissing(queryInterface, 'caixas', 'funcionario_fechamento_nome', {
        type: Sequelize.STRING(120),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await removeIndexIfExists(queryInterface, 'funcionarios', 'funcionarios_usuario_codigo_hash_unico');
    await removeIndexIfExists(queryInterface, 'funcionarios', 'funcionarios_usuario_nome_idx');
    await removeIndexIfExists(queryInterface, 'funcionarios', 'funcionarios_usuario_ativo_idx');

    if (await tableExists(queryInterface, 'funcionarios')) {
      await queryInterface.dropTable('funcionarios');
    }

    await removeColumnIfExists(queryInterface, 'caixas', 'funcionario_fechamento_nome');
    await removeColumnIfExists(queryInterface, 'caixas', 'funcionario_fechamento_id');
    await removeColumnIfExists(queryInterface, 'configuracoes', 'controle_funcionarios');
  },
};
