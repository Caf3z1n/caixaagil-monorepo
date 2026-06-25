const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class PlanoLimite extends Model {}

PlanoLimite.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    plano_versao_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    codigo: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(140),
      allowNull: false,
    },
    valor: {
      type: DataTypes.INTEGER,
    },
    unidade: {
      type: DataTypes.STRING(40),
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'PlanoLimite',
    tableName: 'plano_limites',
    timestamps: true,
    underscored: true,
  }
);

module.exports = PlanoLimite;
