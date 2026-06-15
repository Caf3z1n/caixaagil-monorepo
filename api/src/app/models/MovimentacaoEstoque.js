const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class MovimentacaoEstoque extends Model {}

MovimentacaoEstoque.init(
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
    lancamento_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    produto_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    produto_nome: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    estoque_origem_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    estoque_origem_nome: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    estoque_destino_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    estoque_destino_nome: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    tipo: {
      type: DataTypes.STRING(24),
      allowNull: false,
    },
    quantidade: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
      defaultValue: 0,
    },
    saldo_origem_antes: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: true,
    },
    saldo_origem_depois: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: true,
    },
    saldo_destino_antes: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: true,
    },
    saldo_destino_depois: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: true,
    },
    documento: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    observacao: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'MovimentacaoEstoque',
    tableName: 'movimentacoes_estoque',
    timestamps: true,
    underscored: true,
  }
);

module.exports = MovimentacaoEstoque;
