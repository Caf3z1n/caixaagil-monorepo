module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('categorias_produtos')) {
      await queryInterface.createTable('categorias_produtos', {
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
        icone: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'package',
        },
        cor: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'laranja',
        },
        ordem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
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

      await queryInterface.addIndex('categorias_produtos', ['usuario_id', 'ordem'], {
        name: 'categorias_produtos_usuario_ordem_idx',
      });

      await queryInterface.addIndex('categorias_produtos', ['usuario_id', 'nome'], {
        name: 'categorias_produtos_usuario_nome_unique',
        unique: true,
      });
    }

    if (!tables.includes('produtos')) {
      await queryInterface.createTable('produtos', {
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
        categoria_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'categorias_produtos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        grupo_fiscal_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'grupos_fiscais',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        nome: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        codigo_barras: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        ncm: {
          type: Sequelize.STRING(8),
          allowNull: true,
        },
        preco_custo_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        preco_venda_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        controla_estoque: {
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

      await queryInterface.addIndex('produtos', ['usuario_id', 'categoria_id'], {
        name: 'produtos_usuario_categoria_idx',
      });

      await queryInterface.addIndex('produtos', ['usuario_id', 'grupo_fiscal_id'], {
        name: 'produtos_usuario_grupo_fiscal_idx',
      });

      await queryInterface.addIndex('produtos', ['usuario_id', 'nome'], {
        name: 'produtos_usuario_nome_idx',
      });

      await queryInterface.addIndex('produtos', ['usuario_id', 'codigo_barras'], {
        name: 'produtos_usuario_codigo_barras_unique',
        unique: true,
      });
    }

    if (!tables.includes('estoques')) {
      await queryInterface.createTable('estoques', {
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
        principal_venda: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        permite_venda: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        ordem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
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

      await queryInterface.addIndex('estoques', ['usuario_id', 'ordem'], {
        name: 'estoques_usuario_ordem_idx',
      });

      await queryInterface.addIndex('estoques', ['usuario_id', 'nome'], {
        name: 'estoques_usuario_nome_unique',
        unique: true,
      });
    }

    if (!tables.includes('saldos_estoques_produtos')) {
      await queryInterface.createTable('saldos_estoques_produtos', {
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
          allowNull: false,
          references: {
            model: 'produtos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        estoque_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'estoques',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        quantidade: {
          type: Sequelize.DECIMAL(12, 3),
          allowNull: false,
          defaultValue: 0,
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

      await queryInterface.addIndex('saldos_estoques_produtos', ['usuario_id', 'produto_id'], {
        name: 'saldos_estoques_produtos_usuario_produto_idx',
      });

      await queryInterface.addIndex('saldos_estoques_produtos', ['produto_id', 'estoque_id'], {
        name: 'saldos_estoques_produtos_produto_estoque_unique',
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('saldos_estoques_produtos')) {
      await queryInterface.dropTable('saldos_estoques_produtos');
    }

    if (tables.includes('estoques')) {
      await queryInterface.dropTable('estoques');
    }

    if (tables.includes('produtos')) {
      await queryInterface.dropTable('produtos');
    }

    if (tables.includes('categorias_produtos')) {
      await queryInterface.dropTable('categorias_produtos');
    }
  },
};
