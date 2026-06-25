const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class AlteracaoAssinatura extends Model {}

AlteracaoAssinatura.init(
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
    assinatura_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'downgrade',
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'agendada',
    },
    plano_atual: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    plano_novo: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    plano_versao_id: {
      type: DataTypes.INTEGER,
    },
    plano_snapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    valor_atual_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    valor_novo_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    moeda: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'BRL',
    },
    aplicar_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    aplicada_em: {
      type: DataTypes.DATE,
    },
    cancelada_em: {
      type: DataTypes.DATE,
    },
    motivo_cancelamento: {
      type: DataTypes.TEXT,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'AlteracaoAssinatura',
    tableName: 'alteracoes_assinaturas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = AlteracaoAssinatura;
