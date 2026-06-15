module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('pdvs')) {
      return;
    }

    await queryInterface.createTable('pdvs', {
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
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      descricao: {
        type: Sequelize.STRING(160),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: 'pendente',
      },
      dispositivo_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      credencial_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      codigo_pareamento_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      codigo_pareamento_expira_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      codigo_pareamento_usado_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      pareado_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ultimo_acesso_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ultima_sincronizacao_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ultima_fila_offline_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      sincronizacao_pendente: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex('pdvs', ['usuario_id'], {
      name: 'pdvs_usuario_id_idx',
    });

    await queryInterface.addIndex('pdvs', ['codigo_pareamento_hash'], {
      name: 'pdvs_codigo_pareamento_hash_idx',
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('pdvs')) {
      await queryInterface.dropTable('pdvs');
    }
  },
};
