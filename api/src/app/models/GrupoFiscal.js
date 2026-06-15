const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class GrupoFiscal extends Model {}

GrupoFiscal.init(
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
    icone: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'package',
    },
    regime_tributario: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'simples_nacional',
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ncm: {
      type: DataTypes.STRING(8),
    },
    cfop: {
      type: DataTypes.STRING(4),
      allowNull: false,
    },
    cst_icms: {
      type: DataTypes.STRING(2),
    },
    csosn: {
      type: DataTypes.STRING(3),
    },
    aliquota_icms: {
      type: DataTypes.DECIMAL(8, 4),
    },
    reducao_icms: {
      type: DataTypes.DECIMAL(8, 4),
    },
    base_icms_st: {
      type: DataTypes.DECIMAL(8, 4),
    },
    cst_pis: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    aliquota_pis: {
      type: DataTypes.DECIMAL(8, 4),
    },
    cst_cofins: {
      type: DataTypes.STRING(2),
      allowNull: false,
    },
    aliquota_cofins: {
      type: DataTypes.DECIMAL(8, 4),
    },
    ibs_ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    cst_ibs: {
      type: DataTypes.STRING(3),
    },
    classificacao_ibs: {
      type: DataTypes.STRING(6),
    },
    aliquota_ibs_uf: {
      type: DataTypes.DECIMAL(8, 4),
    },
    aliquota_ibs_municipal: {
      type: DataTypes.DECIMAL(8, 4),
    },
    aliquota_cbs: {
      type: DataTypes.DECIMAL(8, 4),
    },
  },
  {
    sequelize,
    modelName: 'GrupoFiscal',
    tableName: 'grupos_fiscais',
    timestamps: true,
    underscored: true,
  }
);

module.exports = GrupoFiscal;
