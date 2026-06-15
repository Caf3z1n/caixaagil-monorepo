const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class ConferenciaCaixa extends Model {}

ConferenciaCaixa.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    caixa_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    dinheiro_confirmado_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cartao_confirmado_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pix_confirmado_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    convenio_confirmado_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    revisado_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'ConferenciaCaixa',
    tableName: 'conferencias_caixa',
    timestamps: true,
    underscored: true,
  }
);

module.exports = ConferenciaCaixa;
