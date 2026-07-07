module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('caixas')) {
      await queryInterface.createTable('caixas', {
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
          allowNull: true,
          references: {
            model: 'pdvs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        dispositivo_id: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        data_operacao_chave: {
          type: Sequelize.STRING(10),
          allowNull: false,
        },
        data_operacao_rotulo: {
          type: Sequelize.STRING(10),
          allowNull: false,
        },
        numero_turno: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        situacao: {
          type: Sequelize.STRING(16),
          allowNull: false,
          defaultValue: 'aberto',
        },
        aberto_em: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        fechado_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        funcionario_abertura_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        funcionario_abertura_nome: {
          type: Sequelize.STRING(120),
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

      await queryInterface.addIndex('caixas', ['usuario_id'], {
        name: 'caixas_usuario_id_idx',
      });
      await queryInterface.addIndex('caixas', ['usuario_id', 'pdv_id', 'data_operacao_chave', 'numero_turno'], {
        name: 'caixas_usuario_pdv_data_turno_unico',
        unique: true,
      });
      await queryInterface.addIndex('caixas', ['usuario_id', 'situacao'], {
        name: 'caixas_usuario_situacao_idx',
      });
      await queryInterface.addIndex('caixas', ['usuario_id', 'fechado_em'], {
        name: 'caixas_usuario_fechado_em_idx',
      });
    }

    if (!tables.includes('vendas')) {
      await queryInterface.createTable('vendas', {
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
          allowNull: true,
          references: {
            model: 'pdvs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        dispositivo_id: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        caixa_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          references: {
            model: 'caixas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        codigo: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        tipo_origem: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'caixa',
        },
        referencia_origem: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        titulo: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        convenio_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
        },
        nome_cliente: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        nome_consumidor: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        documento_consumidor: {
          type: Sequelize.STRING(32),
          allowNull: true,
        },
        rotulo_origem: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        canal: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        itens: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        quantidade_itens: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        subtotal_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        total_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        desconto_pagamento_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        metodo_pagamento: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        metodo_pagamento_recebimento: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        parcelamento: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        caixa_recebimento_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          references: {
            model: 'caixas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        situacao: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'paga',
        },
        situacao_recebimento: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'nenhum',
        },
        recebido_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        observacao: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        registrado_em: {
          type: Sequelize.DATE,
          allowNull: false,
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

      await queryInterface.addIndex('vendas', ['usuario_id'], {
        name: 'vendas_usuario_id_idx',
      });
      await queryInterface.addIndex('vendas', ['usuario_id', 'codigo'], {
        name: 'vendas_usuario_codigo_unico',
        unique: true,
      });
      await queryInterface.addIndex('vendas', ['usuario_id', 'registrado_em'], {
        name: 'vendas_usuario_registrado_em_idx',
      });
      await queryInterface.addIndex('vendas', ['usuario_id', 'caixa_id'], {
        name: 'vendas_usuario_caixa_idx',
      });
      await queryInterface.addIndex('vendas', ['usuario_id', 'pdv_id'], {
        name: 'vendas_usuario_pdv_idx',
      });
      await queryInterface.addIndex('vendas', ['usuario_id', 'caixa_recebimento_id'], {
        name: 'vendas_usuario_caixa_recebimento_idx',
      });
      await queryInterface.addIndex('vendas', ['usuario_id', 'situacao'], {
        name: 'vendas_usuario_situacao_idx',
      });
    }

    if (!tables.includes('despesas_caixa')) {
      await queryInterface.createTable('despesas_caixa', {
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
          allowNull: true,
          references: {
            model: 'pdvs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        dispositivo_id: {
          type: Sequelize.STRING(120),
          allowNull: true,
        },
        caixa_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          references: {
            model: 'caixas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        descricao: {
          type: Sequelize.STRING(160),
          allowNull: false,
        },
        valor_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        registrado_em: {
          type: Sequelize.DATE,
          allowNull: false,
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

      await queryInterface.addIndex('despesas_caixa', ['usuario_id'], {
        name: 'despesas_caixa_usuario_id_idx',
      });
      await queryInterface.addIndex('despesas_caixa', ['usuario_id', 'caixa_id'], {
        name: 'despesas_caixa_usuario_caixa_idx',
      });
      await queryInterface.addIndex('despesas_caixa', ['usuario_id', 'pdv_id'], {
        name: 'despesas_caixa_usuario_pdv_idx',
      });
      await queryInterface.addIndex('despesas_caixa', ['usuario_id', 'registrado_em'], {
        name: 'despesas_caixa_usuario_registrado_em_idx',
      });
    }

    if (!tables.includes('conferencias_caixa')) {
      await queryInterface.createTable('conferencias_caixa', {
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
        caixa_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          references: {
            model: 'caixas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        dinheiro_confirmado_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        cartao_confirmado_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        pix_confirmado_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        parcelamento_confirmado_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        convenio_confirmado_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        ativo: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        revisado_em: {
          type: Sequelize.DATE,
          allowNull: false,
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

      await queryInterface.addIndex('conferencias_caixa', ['usuario_id'], {
        name: 'conferencias_caixa_usuario_id_idx',
      });
      await queryInterface.addIndex('conferencias_caixa', ['usuario_id', 'caixa_id'], {
        name: 'conferencias_caixa_usuario_caixa_unico',
        unique: true,
      });
      await queryInterface.addIndex('conferencias_caixa', ['usuario_id', 'revisado_em'], {
        name: 'conferencias_caixa_usuario_revisado_em_idx',
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('conferencias_caixa')) {
      await queryInterface.dropTable('conferencias_caixa');
    }

    if (tables.includes('despesas_caixa')) {
      await queryInterface.dropTable('despesas_caixa');
    }

    if (tables.includes('vendas')) {
      await queryInterface.dropTable('vendas');
    }

    if (tables.includes('caixas')) {
      await queryInterface.dropTable('caixas');
    }
  },
};
