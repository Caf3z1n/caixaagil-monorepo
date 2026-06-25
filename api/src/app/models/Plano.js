const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Plano extends Model {}

Plano.init(
  {
    id: {
      type: DataTypes.STRING(60),
      primaryKey: true,
    },
    nome: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    publico: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'Plano',
    tableName: 'planos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Plano;
