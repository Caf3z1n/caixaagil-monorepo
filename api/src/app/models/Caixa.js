const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Caixa extends Model {}

Caixa.init(
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
    data_operacao_chave: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    data_operacao_rotulo: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    numero_turno: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    situacao: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'aberto',
    },
    aberto_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    fechado_em: {
      type: DataTypes.DATE,
    },
    funcionario_abertura_id: {
      type: DataTypes.STRING(64),
    },
    funcionario_abertura_nome: {
      type: DataTypes.STRING(120),
    },
    funcionario_fechamento_id: {
      type: DataTypes.STRING(64),
    },
    funcionario_fechamento_nome: {
      type: DataTypes.STRING(120),
    },
  },
  {
    sequelize,
    modelName: 'Caixa',
    tableName: 'caixas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Caixa;
