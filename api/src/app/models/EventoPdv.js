const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class EventoPdv extends Model {}

EventoPdv.init(
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
      allowNull: false,
    },
    dispositivo_id: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    chave_idempotencia: {
      type: DataTypes.STRING(220),
      allowNull: false,
      unique: true,
    },
    tipo: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    agregado_tipo: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    agregado_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'processado',
    },
    erro: {
      type: DataTypes.TEXT,
    },
    recebido_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    processado_em: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'EventoPdv',
    tableName: 'eventos_pdv',
    timestamps: true,
    underscored: true,
  }
);

module.exports = EventoPdv;
