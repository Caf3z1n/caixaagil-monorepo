const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class PlanoRecurso extends Model {}

PlanoRecurso.init(
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
    habilitado: {
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
    modelName: 'PlanoRecurso',
    tableName: 'plano_recursos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = PlanoRecurso;
