const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class ConfiguracaoSistema extends Model {}

ConfiguracaoSistema.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    formas_pagamento: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        dinheiro: true,
        pix: true,
        cartao: true,
        parcelamento: false,
        convenio: false,
      },
    },
    lancar_despesas: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        ativo: false,
      },
    },
    controle_funcionarios: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        ativo: false,
      },
    },
    comandas: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        ativo: false,
      },
    },
    resumo_turno: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        ativo: false,
      },
    },
    fiscal: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    integracoes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'ConfiguracaoSistema',
    tableName: 'configuracoes',
    timestamps: true,
    underscored: true,
  }
);

module.exports = ConfiguracaoSistema;
