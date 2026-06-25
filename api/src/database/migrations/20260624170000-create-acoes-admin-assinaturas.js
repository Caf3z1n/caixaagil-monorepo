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
    if (!(await tableExists(queryInterface, 'acoes_admin_assinaturas'))) {
      await queryInterface.createTable('acoes_admin_assinaturas', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        administrador_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'admin',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
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
        acao: {
          type: Sequelize.STRING(60),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: 'concluida',
        },
        motivo: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        dados_anteriores: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        dados_novos: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
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

    await addIndexIfMissing(queryInterface, 'acoes_admin_assinaturas', ['assinatura_id', 'created_at'], {
      name: 'acoes_admin_assinaturas_assinatura_created_idx',
    });
    await addIndexIfMissing(queryInterface, 'acoes_admin_assinaturas', ['usuario_id', 'created_at'], {
      name: 'acoes_admin_assinaturas_usuario_created_idx',
    });
    await addIndexIfMissing(queryInterface, 'acoes_admin_assinaturas', ['administrador_id', 'created_at'], {
      name: 'acoes_admin_assinaturas_admin_created_idx',
    });
  },

  async down(queryInterface) {
    await removeIndexIfExists(queryInterface, 'acoes_admin_assinaturas', 'acoes_admin_assinaturas_admin_created_idx');
    await removeIndexIfExists(queryInterface, 'acoes_admin_assinaturas', 'acoes_admin_assinaturas_usuario_created_idx');
    await removeIndexIfExists(queryInterface, 'acoes_admin_assinaturas', 'acoes_admin_assinaturas_assinatura_created_idx');

    if (await tableExists(queryInterface, 'acoes_admin_assinaturas')) {
      await queryInterface.dropTable('acoes_admin_assinaturas');
    }
  },
};
