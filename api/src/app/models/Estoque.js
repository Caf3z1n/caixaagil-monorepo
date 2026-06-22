const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Estoque extends Model {}

Estoque.init(
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
    nome: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    principal_venda: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    permite_venda: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Estoque',
    tableName: 'estoques',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Estoque;
