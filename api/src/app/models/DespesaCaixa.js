const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class DespesaCaixa extends Model {}

DespesaCaixa.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pdv_id: {
      type: DataTypes.INTEGER,
    },
    dispositivo_id: {
      type: DataTypes.STRING(120),
    },
    caixa_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    valor_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    registrado_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'DespesaCaixa',
    tableName: 'despesas_caixa',
    timestamps: true,
    underscored: true,
  }
);

module.exports = DespesaCaixa;
