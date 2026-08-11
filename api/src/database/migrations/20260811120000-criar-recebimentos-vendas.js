module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async transaction => {
      const tables = await queryInterface.showAllTables({ transaction });

      if (tables.includes('recebimentos_vendas')) {
        return;
      }

      await queryInterface.createTable('recebimentos_vendas', {
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
      venda_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: {
          model: 'vendas',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      chave_idempotencia: {
        type: Sequelize.STRING(220),
        allowNull: false,
      },
      tipo: {
        type: Sequelize.STRING(24),
        allowNull: false,
      },
      parcela_numero: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      parcelas_total: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      cliente_nome: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      valor_centavos: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      metodo_pagamento: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      recebido_em: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'confirmado',
      },
      cancelado_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      motivo_cancelamento: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      origem: {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: 'pdv',
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
      }, { transaction });

      await queryInterface.addIndex('recebimentos_vendas', ['chave_idempotencia'], {
        name: 'recebimentos_vendas_chave_idempotencia_unica',
        unique: true,
        transaction,
      });
      await queryInterface.addIndex('recebimentos_vendas', ['usuario_id', 'caixa_id', 'status'], {
        name: 'recebimentos_vendas_usuario_caixa_status_idx',
        transaction,
      });
      await queryInterface.addIndex('recebimentos_vendas', ['usuario_id', 'venda_id', 'tipo'], {
        name: 'recebimentos_vendas_usuario_venda_tipo_idx',
        transaction,
      });
      await queryInterface.addIndex('recebimentos_vendas', ['usuario_id', 'recebido_em'], {
        name: 'recebimentos_vendas_usuario_recebido_em_idx',
        transaction,
      });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX recebimentos_vendas_operacao_ativa_unica
        ON recebimentos_vendas (usuario_id, venda_id, tipo, COALESCE(parcela_numero, 0))
        WHERE status = 'confirmado'
      `, { transaction });
      await queryInterface.addConstraint('recebimentos_vendas', {
        fields: ['valor_centavos'],
        type: 'check',
        name: 'recebimentos_vendas_valor_positivo_check',
        where: {
          valor_centavos: { [Sequelize.Op.gt]: 0 },
        },
        transaction,
      });
      await queryInterface.addConstraint('recebimentos_vendas', {
        fields: ['tipo'],
        type: 'check',
        name: 'recebimentos_vendas_tipo_check',
        where: {
          tipo: { [Sequelize.Op.in]: ['entrada', 'parcela', 'convenio'] },
        },
        transaction,
      });
      await queryInterface.addConstraint('recebimentos_vendas', {
        fields: ['status'],
        type: 'check',
        name: 'recebimentos_vendas_status_check',
        where: {
          status: { [Sequelize.Op.in]: ['confirmado', 'cancelado'] },
        },
        transaction,
      });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async transaction => {
      const tables = await queryInterface.showAllTables({ transaction });

      if (tables.includes('recebimentos_vendas')) {
        await queryInterface.dropTable('recebimentos_vendas', { transaction });
      }
    });
  },
};
