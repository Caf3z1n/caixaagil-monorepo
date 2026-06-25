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
    if (!(await tableExists(queryInterface, 'codigos_assinatura'))) {
      await queryInterface.createTable('codigos_assinatura', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        codigo: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        plano_id: {
          type: Sequelize.STRING(60),
          allowNull: false,
          references: {
            model: 'planos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        plano_versao_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'plano_versoes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        nome: {
          type: Sequelize.STRING(140),
          allowNull: false,
        },
        valor_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        moeda: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'BRL',
        },
        trial_dias: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        expira_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        ativo: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        usos_maximos: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        usos_realizados: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        observacao: {
          type: Sequelize.TEXT,
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

    await addIndexIfMissing(queryInterface, 'codigos_assinatura', ['codigo'], {
      name: 'codigos_assinatura_codigo_unique',
      unique: true,
    });
    await addIndexIfMissing(queryInterface, 'codigos_assinatura', ['plano_id', 'ativo'], {
      name: 'codigos_assinatura_plano_ativo_idx',
    });
    await addIndexIfMissing(queryInterface, 'codigos_assinatura', ['plano_versao_id', 'ativo'], {
      name: 'codigos_assinatura_versao_ativo_idx',
    });
  },

  async down(queryInterface) {
    await removeIndexIfExists(queryInterface, 'codigos_assinatura', 'codigos_assinatura_versao_ativo_idx');
    await removeIndexIfExists(queryInterface, 'codigos_assinatura', 'codigos_assinatura_plano_ativo_idx');
    await removeIndexIfExists(queryInterface, 'codigos_assinatura', 'codigos_assinatura_codigo_unique');

    if (await tableExists(queryInterface, 'codigos_assinatura')) {
      await queryInterface.dropTable('codigos_assinatura');
    }
  },
};
