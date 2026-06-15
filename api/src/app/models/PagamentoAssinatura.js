const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class PagamentoAssinatura extends Model {}

PagamentoAssinatura.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    assinatura_id: {
      type: DataTypes.INTEGER,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
    },
    mercado_pago_payment_id: {
      type: DataTypes.STRING,
    },
    mercado_pago_authorized_payment_id: {
      type: DataTypes.STRING,
    },
    mercado_pago_preapproval_id: {
      type: DataTypes.STRING,
    },
    referencia_externa: {
      type: DataTypes.STRING,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status_detalhe: {
      type: DataTypes.STRING,
    },
    valor_centavos: {
      type: DataTypes.INTEGER,
    },
    valor_liquido_centavos: {
      type: DataTypes.INTEGER,
    },
    moeda: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'BRL',
    },
    forma_pagamento: {
      type: DataTypes.STRING,
    },
    parcelas: {
      type: DataTypes.INTEGER,
    },
    pago_em: {
      type: DataTypes.DATE,
    },
    vencimento_em: {
      type: DataTypes.DATE,
    },
    processado_em: {
      type: DataTypes.DATE,
    },
    payload_mercado_pago: {
      type: DataTypes.JSONB,
    },
  },
  {
    sequelize,
    modelName: 'PagamentoAssinatura',
    tableName: 'pagamentos_assinaturas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = PagamentoAssinatura;
