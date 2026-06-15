module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('movimentacoes_estoque')) {
      return;
    }

    await queryInterface.createTable('movimentacoes_estoque', {
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
      produto_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'produtos',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      produto_nome: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      estoque_origem_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'estoques',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      estoque_origem_nome: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      estoque_destino_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'estoques',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      estoque_destino_nome: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      tipo: {
        type: Sequelize.STRING(24),
        allowNull: false,
      },
      quantidade: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      saldo_origem_antes: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: true,
      },
      saldo_origem_depois: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: true,
      },
      saldo_destino_antes: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: true,
      },
      saldo_destino_depois: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: true,
      },
      documento: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      observacao: {
        type: Sequelize.STRING(255),
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

    await queryInterface.addIndex('movimentacoes_estoque', ['usuario_id', 'created_at'], {
      name: 'movimentacoes_estoque_usuario_data_idx',
    });

    await queryInterface.addIndex('movimentacoes_estoque', ['usuario_id', 'tipo'], {
      name: 'movimentacoes_estoque_usuario_tipo_idx',
    });

    await queryInterface.addIndex('movimentacoes_estoque', ['usuario_id', 'produto_id'], {
      name: 'movimentacoes_estoque_usuario_produto_idx',
    });

    await queryInterface.addIndex('movimentacoes_estoque', ['usuario_id', 'estoque_origem_id'], {
      name: 'movimentacoes_estoque_usuario_origem_idx',
    });

    await queryInterface.addIndex('movimentacoes_estoque', ['usuario_id', 'estoque_destino_id'], {
      name: 'movimentacoes_estoque_usuario_destino_idx',
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('movimentacoes_estoque')) {
      await queryInterface.dropTable('movimentacoes_estoque');
    }
  },
};
