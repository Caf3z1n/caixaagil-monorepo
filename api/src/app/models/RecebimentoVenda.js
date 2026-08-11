const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class RecebimentoVenda extends Model {}

RecebimentoVenda.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pdv_id: {
      type: DataTypes.INTEGER,
    },
    caixa_id: {
      type: DataTypes.STRING(64),
    },
    venda_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    chave_idempotencia: {
      type: DataTypes.STRING(220),
      allowNull: false,
      unique: true,
    },
    tipo: {
      type: DataTypes.STRING(24),
      allowNull: false,
    },
    parcela_numero: {
      type: DataTypes.INTEGER,
    },
    parcelas_total: {
      type: DataTypes.INTEGER,
    },
    cliente_nome: {
      type: DataTypes.STRING(120),
    },
    valor_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    metodo_pagamento: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    recebido_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'confirmado',
    },
    cancelado_em: {
      type: DataTypes.DATE,
    },
    motivo_cancelamento: {
      type: DataTypes.STRING(300),
    },
    origem: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'pdv',
    },
    metadados: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'RecebimentoVenda',
    tableName: 'recebimentos_vendas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = RecebimentoVenda;
