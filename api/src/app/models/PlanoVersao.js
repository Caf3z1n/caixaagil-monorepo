const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class PlanoVersao extends Model {}

PlanoVersao.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    plano_id: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
    },
    valor_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    moeda: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'BRL',
    },
    intervalo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'mensal',
    },
    intervalo_quantidade: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    vigente_de: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    vigente_ate: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'PlanoVersao',
    tableName: 'plano_versoes',
    timestamps: true,
    underscored: true,
  }
);

module.exports = PlanoVersao;
