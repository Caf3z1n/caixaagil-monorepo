const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class CategoriaProduto extends Model {}

CategoriaProduto.init(
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
    icone: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'package',
    },
    cor: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'laranja',
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'CategoriaProduto',
    tableName: 'categorias_produtos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = CategoriaProduto;
