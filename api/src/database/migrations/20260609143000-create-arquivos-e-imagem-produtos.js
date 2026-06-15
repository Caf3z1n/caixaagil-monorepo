module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('arquivos')) {
      await queryInterface.createTable('arquivos', {
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
        nome_original: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        nome_armazenado: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        mime_type: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        extensao: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        tamanho_bytes: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 0,
        },
        tipo: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'outro',
        },
        contexto: {
          type: Sequelize.STRING(60),
          allowNull: true,
        },
        visibilidade: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'privado',
        },
        caminho_relativo: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        metadados: {
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

      await queryInterface.addIndex('arquivos', ['usuario_id', 'tipo'], {
        name: 'arquivos_usuario_tipo_idx',
      });

      await queryInterface.addIndex('arquivos', ['usuario_id', 'contexto'], {
        name: 'arquivos_usuario_contexto_idx',
      });

      await queryInterface.addIndex('arquivos', ['visibilidade'], {
        name: 'arquivos_visibilidade_idx',
      });
    }

    if (tables.includes('produtos')) {
      const produtos = await queryInterface.describeTable('produtos');

      if (!produtos.imagem_arquivo_id) {
        await queryInterface.addColumn('produtos', 'imagem_arquivo_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'arquivos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        });

        await queryInterface.addIndex('produtos', ['usuario_id', 'imagem_arquivo_id'], {
          name: 'produtos_usuario_imagem_arquivo_idx',
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('produtos')) {
      const produtos = await queryInterface.describeTable('produtos');

      if (produtos.imagem_arquivo_id) {
        await queryInterface.removeIndex('produtos', 'produtos_usuario_imagem_arquivo_idx')
          .catch(() => null);
        await queryInterface.removeColumn('produtos', 'imagem_arquivo_id');
      }
    }

    if (tables.includes('arquivos')) {
      await queryInterface.dropTable('arquivos');
    }
  },
};
