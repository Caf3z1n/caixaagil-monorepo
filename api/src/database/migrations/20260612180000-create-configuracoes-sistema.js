module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('configuracoes')) {
      return;
    }

    if (tables.includes('configuracoes_sistema')) {
      await queryInterface.renameTable('configuracoes_sistema', 'configuracoes');
      return;
    }

    await queryInterface.createTable('configuracoes', {
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
      formas_pagamento: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          dinheiro: true,
          pix: true,
          cartao: true,
          convenio: false,
        },
      },
      lancar_despesas: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          ativo: true,
        },
      },
      controle_funcionarios: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {
          ativo: false,
        },
      },
      fiscal: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      integracoes: {
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

    await queryInterface.addIndex('configuracoes', ['usuario_id'], {
      unique: true,
      name: 'configuracoes_usuario_id_unique',
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('configuracoes')) {
      await queryInterface.dropTable('configuracoes');
    }
  },
};
