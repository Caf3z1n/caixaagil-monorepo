const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class ClienteConvenio extends Model {}

ClienteConvenio.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tipo_pessoa: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'fisica',
    },
    nome: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    permite_pagamento_frente_caixa: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    dados_fiscais: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'ClienteConvenio',
    tableName: 'clientes_convenio',
    timestamps: true,
    underscored: true,
  }
);

module.exports = ClienteConvenio;
