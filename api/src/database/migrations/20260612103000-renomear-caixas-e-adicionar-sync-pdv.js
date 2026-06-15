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

function pdvReference(Sequelize) {
  return {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: {
      model: 'pdvs',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  };
}

function dispositivoReference(Sequelize) {
  return {
    type: Sequelize.STRING(120),
    allowNull: true,
  };
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const hasSessoesCaixa = await tableExists(queryInterface, 'sessoes_caixa');
    const hasCaixas = await tableExists(queryInterface, 'caixas');

    if (hasSessoesCaixa && !hasCaixas) {
      await queryInterface.renameTable('sessoes_caixa', 'caixas');
    }

    if (await tableExists(queryInterface, 'caixas')) {
      await addColumnIfMissing(queryInterface, 'caixas', 'pdv_id', pdvReference(Sequelize));
      await addColumnIfMissing(queryInterface, 'caixas', 'dispositivo_id', dispositivoReference(Sequelize));

      await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_id_idx');
      await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_data_turno_unico');
      await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_situacao_idx');
      await removeIndexIfExists(queryInterface, 'caixas', 'sessoes_caixa_usuario_fechado_em_idx');
      await removeIndexIfExists(queryInterface, 'caixas', 'caixas_usuario_data_turno_unico');

      await addIndexIfMissing(queryInterface, 'caixas', ['usuario_id'], {
        name: 'caixas_usuario_id_idx',
      });
      await addIndexIfMissing(queryInterface, 'caixas', ['usuario_id', 'pdv_id', 'data_operacao_chave', 'numero_turno'], {
        name: 'caixas_usuario_pdv_data_turno_unico',
        unique: true,
      });
      await addIndexIfMissing(queryInterface, 'caixas', ['usuario_id', 'situacao'], {
        name: 'caixas_usuario_situacao_idx',
      });
      await addIndexIfMissing(queryInterface, 'caixas', ['usuario_id', 'fechado_em'], {
        name: 'caixas_usuario_fechado_em_idx',
      });
    }

    if (await tableExists(queryInterface, 'vendas')) {
      await addColumnIfMissing(queryInterface, 'vendas', 'pdv_id', pdvReference(Sequelize));
      await addColumnIfMissing(queryInterface, 'vendas', 'dispositivo_id', dispositivoReference(Sequelize));
      await addIndexIfMissing(queryInterface, 'vendas', ['usuario_id', 'pdv_id'], {
        name: 'vendas_usuario_pdv_idx',
      });
    }

    if (await tableExists(queryInterface, 'despesas_caixa')) {
      await addColumnIfMissing(queryInterface, 'despesas_caixa', 'pdv_id', pdvReference(Sequelize));
      await addColumnIfMissing(queryInterface, 'despesas_caixa', 'dispositivo_id', dispositivoReference(Sequelize));
      await addIndexIfMissing(queryInterface, 'despesas_caixa', ['usuario_id', 'pdv_id'], {
        name: 'despesas_caixa_usuario_pdv_idx',
      });
    }

    if (!(await tableExists(queryInterface, 'eventos_pdv'))) {
      await queryInterface.createTable('eventos_pdv', {
        id: {
          type: Sequelize.STRING(64),
          allowNull: false,
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
        pdv_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'pdvs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        dispositivo_id: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        chave_idempotencia: {
          type: Sequelize.STRING(220),
          allowNull: false,
        },
        tipo: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        agregado_tipo: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        agregado_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        payload: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        status: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'processado',
        },
        erro: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        recebido_em: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        processado_em: {
          type: Sequelize.DATE,
          allowNull: true,
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

    await addIndexIfMissing(queryInterface, 'eventos_pdv', ['chave_idempotencia'], {
      name: 'eventos_pdv_chave_idempotencia_unico',
      unique: true,
    });
    await addIndexIfMissing(queryInterface, 'eventos_pdv', ['usuario_id', 'pdv_id', 'recebido_em'], {
      name: 'eventos_pdv_usuario_pdv_recebido_idx',
    });
    await addIndexIfMissing(queryInterface, 'eventos_pdv', ['usuario_id', 'pdv_id', 'agregado_tipo', 'agregado_id'], {
      name: 'eventos_pdv_agregado_idx',
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'eventos_pdv')) {
      await queryInterface.dropTable('eventos_pdv');
    }

    if (await tableExists(queryInterface, 'despesas_caixa')) {
      await removeIndexIfExists(queryInterface, 'despesas_caixa', 'despesas_caixa_usuario_pdv_idx');
      await removeColumnIfExists(queryInterface, 'despesas_caixa', 'dispositivo_id');
      await removeColumnIfExists(queryInterface, 'despesas_caixa', 'pdv_id');
    }

    if (await tableExists(queryInterface, 'vendas')) {
      await removeIndexIfExists(queryInterface, 'vendas', 'vendas_usuario_pdv_idx');
      await removeColumnIfExists(queryInterface, 'vendas', 'dispositivo_id');
      await removeColumnIfExists(queryInterface, 'vendas', 'pdv_id');
    }

    if (await tableExists(queryInterface, 'caixas')) {
      await removeIndexIfExists(queryInterface, 'caixas', 'caixas_usuario_pdv_data_turno_unico');
      await removeColumnIfExists(queryInterface, 'caixas', 'dispositivo_id');
      await removeColumnIfExists(queryInterface, 'caixas', 'pdv_id');

      if (!(await tableExists(queryInterface, 'sessoes_caixa'))) {
        await queryInterface.renameTable('caixas', 'sessoes_caixa');
        await addIndexIfMissing(queryInterface, 'sessoes_caixa', ['usuario_id', 'data_operacao_chave', 'numero_turno'], {
          name: 'sessoes_caixa_usuario_data_turno_unico',
          unique: true,
        });
      }
    }
  },
};
