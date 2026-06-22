const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Funcionario extends Model {}

Funcionario.init(
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
    nome: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    codigo_hash: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    codigo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Funcionario',
    tableName: 'funcionarios',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Funcionario;
