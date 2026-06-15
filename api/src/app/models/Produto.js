const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Produto extends Model {}

Produto.init(
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
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    grupo_fiscal_id: {
      type: DataTypes.INTEGER,
    },
    imagem_arquivo_id: {
      type: DataTypes.INTEGER,
    },
    nome: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    codigo_barras: {
      type: DataTypes.STRING(64),
    },
    ncm: {
      type: DataTypes.STRING(8),
    },
    preco_custo_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    preco_venda_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    controla_estoque: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Produto',
    tableName: 'produtos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Produto;
