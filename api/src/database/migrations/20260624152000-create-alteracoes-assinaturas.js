async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(index => index.name === options.name);

  if (!exists) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return;
  }

  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(index => index.name === indexName);

  if (exists) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'alteracoes_assinaturas'))) {
      await queryInterface.createTable('alteracoes_assinaturas', {
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
        assinatura_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'assinaturas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        tipo: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'downgrade',
        },
        status: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'agendada',
        },
        plano_atual: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        plano_novo: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        plano_versao_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'plano_versoes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        plano_snapshot: {
          type: Sequelize.JSONB,
          allowNull: false,
        },
        valor_atual_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        valor_novo_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        moeda: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'BRL',
        },
        aplicar_em: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        aplicada_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        cancelada_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        motivo_cancelamento: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        metadata: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
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

    await addIndexIfMissing(queryInterface, 'alteracoes_assinaturas', ['usuario_id', 'status'], {
      name: 'alteracoes_assinaturas_usuario_status_idx',
    });
    await addIndexIfMissing(queryInterface, 'alteracoes_assinaturas', ['assinatura_id', 'status'], {
      name: 'alteracoes_assinaturas_assinatura_status_idx',
    });
    await addIndexIfMissing(queryInterface, 'alteracoes_assinaturas', ['aplicar_em', 'status'], {
      name: 'alteracoes_assinaturas_aplicar_status_idx',
    });
    await addIndexIfMissing(queryInterface, 'alteracoes_assinaturas', ['assinatura_id'], {
      name: 'alteracoes_assinaturas_assinatura_agendada_unique',
      unique: true,
      where: {
        status: 'agendada',
      },
    });
  },

  async down(queryInterface) {
    await removeIndexIfExists(queryInterface, 'alteracoes_assinaturas', 'alteracoes_assinaturas_assinatura_agendada_unique');
    await removeIndexIfExists(queryInterface, 'alteracoes_assinaturas', 'alteracoes_assinaturas_aplicar_status_idx');
    await removeIndexIfExists(queryInterface, 'alteracoes_assinaturas', 'alteracoes_assinaturas_assinatura_status_idx');
    await removeIndexIfExists(queryInterface, 'alteracoes_assinaturas', 'alteracoes_assinaturas_usuario_status_idx');

    if (await tableExists(queryInterface, 'alteracoes_assinaturas')) {
      await queryInterface.dropTable('alteracoes_assinaturas');
    }
  },
};
