const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Arquivo extends Model {}

Arquivo.init(
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
    nome_original: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nome_armazenado: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    mime_type: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    extensao: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    tamanho_bytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    tipo: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'outro',
    },
    contexto: {
      type: DataTypes.STRING(60),
    },
    visibilidade: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'privado',
    },
    caminho_relativo: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    metadados: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'Arquivo',
    tableName: 'arquivos',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Arquivo;
