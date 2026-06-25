const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class AcaoAdminAssinatura extends Model {}

AcaoAdminAssinatura.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    administrador_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    assinatura_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    acao: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'concluida',
    },
    motivo: {
      type: DataTypes.TEXT,
    },
    dados_anteriores: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    dados_novos: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'AcaoAdminAssinatura',
    tableName: 'acoes_admin_assinaturas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = AcaoAdminAssinatura;
