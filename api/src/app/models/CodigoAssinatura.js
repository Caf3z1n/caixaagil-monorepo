const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class CodigoAssinatura extends Model {}

CodigoAssinatura.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    codigo: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
    },
    codigo_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    plano_id: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    plano_versao_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(140),
      allowNull: false,
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
    trial_dias: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    gratuito: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    cobranca_inicio_em: {
      type: DataTypes.DATE,
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
    expira_em: {
      type: DataTypes.DATE,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    usos_maximos: {
      type: DataTypes.INTEGER,
    },
    usos_realizados: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    usado_por_usuario_id: {
      type: DataTypes.INTEGER,
    },
    usado_em: {
      type: DataTypes.DATE,
    },
    observacao: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    modelName: 'CodigoAssinatura',
    tableName: 'codigos_assinatura',
    timestamps: true,
    underscored: true,
  }
);

module.exports = CodigoAssinatura;
