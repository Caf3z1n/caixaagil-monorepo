module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pagamentos_assinaturas', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      assinatura_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'assinaturas',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'usuarios',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      mercado_pago_payment_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      mercado_pago_authorized_payment_id: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      mercado_pago_preapproval_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      referencia_externa: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      status_detalhe: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      valor_centavos: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      valor_liquido_centavos: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      moeda: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'BRL',
      },
      forma_pagamento: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      parcelas: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      pago_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      vencimento_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      processado_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      payload_mercado_pago: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('pagamentos_assinaturas', ['assinatura_id']);
    await queryInterface.addIndex('pagamentos_assinaturas', ['usuario_id']);
    await queryInterface.addIndex('pagamentos_assinaturas', ['mercado_pago_preapproval_id']);
    await queryInterface.addIndex('pagamentos_assinaturas', ['referencia_externa']);
    await queryInterface.addIndex('pagamentos_assinaturas', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pagamentos_assinaturas');
  },
};
