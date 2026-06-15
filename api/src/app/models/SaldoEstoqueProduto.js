const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class SaldoEstoqueProduto extends Model {}

SaldoEstoqueProduto.init(
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
    produto_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    estoque_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    quantidade: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'SaldoEstoqueProduto',
    tableName: 'saldos_estoques_produtos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = SaldoEstoqueProduto;
