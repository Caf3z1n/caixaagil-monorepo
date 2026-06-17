const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class NfEvento extends Model {}

NfEvento.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nf_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    codigo_retorno_sefaz: {
      type: DataTypes.STRING(20),
    },
    mensagem: {
      type: DataTypes.TEXT,
    },
    arquivo_xml_id: {
      type: DataTypes.INTEGER,
    },
    detalhes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    ocorrido_em: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'NfEvento',
    tableName: 'nf_eventos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = NfEvento;
