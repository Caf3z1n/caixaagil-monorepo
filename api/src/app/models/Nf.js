const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Nf extends Model {}

Nf.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    venda_id: {
      type: DataTypes.STRING(64),
    },
    pdv_id: {
      type: DataTypes.INTEGER,
    },
    caixa_id: {
      type: DataTypes.STRING(64),
    },
    ambiente: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'homologacao',
    },
    modelo: {
      type: DataTypes.STRING(2),
      allowNull: false,
      defaultValue: '65',
    },
    serie: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    numero: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    chave_acesso: {
      type: DataTypes.STRING(44),
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'rascunho',
    },
    tipo_emissao: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'normal',
    },
    finalidade: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'normal',
    },
    natureza_operacao: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'Venda',
    },
    total_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    protocolo_autorizacao: {
      type: DataTypes.STRING(80),
    },
    protocolo_cancelamento: {
      type: DataTypes.STRING(80),
    },
    codigo_retorno_sefaz: {
      type: DataTypes.STRING(20),
    },
    mensagem_retorno_sefaz: {
      type: DataTypes.TEXT,
    },
    ultimo_erro_tecnico: {
      type: DataTypes.TEXT,
    },
    xml_enviado_arquivo_id: {
      type: DataTypes.INTEGER,
    },
    xml_autorizado_arquivo_id: {
      type: DataTypes.INTEGER,
    },
    danfe_pdf_arquivo_id: {
      type: DataTypes.INTEGER,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    retorno_sefaz: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    eventos: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    emitida_em: {
      type: DataTypes.DATE,
    },
    autorizada_em: {
      type: DataTypes.DATE,
    },
    cancelada_em: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'Nf',
    tableName: 'nf',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Nf;
