const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Venda extends Model {}

Venda.init(
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
    caixa_id: {
      type: DataTypes.STRING(64),
    },
    codigo: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    tipo_origem: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'caixa',
    },
    referencia_origem: {
      type: DataTypes.STRING(64),
    },
    titulo: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    convenio_id: {
      type: DataTypes.STRING(64),
    },
    cliente_convenio_id: {
      type: DataTypes.INTEGER,
    },
    nome_cliente: {
      type: DataTypes.STRING(120),
    },
    nome_consumidor: {
      type: DataTypes.STRING(120),
    },
    documento_consumidor: {
      type: DataTypes.STRING(32),
    },
    rotulo_origem: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    canal: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    itens: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    quantidade_itens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    subtotal_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    desconto_pagamento_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    metodo_pagamento: {
      type: DataTypes.STRING(20),
    },
    metodo_pagamento_recebimento: {
      type: DataTypes.STRING(20),
    },
    caixa_recebimento_id: {
      type: DataTypes.STRING(64),
    },
    situacao: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'paga',
    },
    status_convenio: {
      type: DataTypes.STRING(20),
    },
    situacao_recebimento: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'nenhum',
    },
    recebido_em: {
      type: DataTypes.DATE,
    },
    observacao: {
      type: DataTypes.TEXT,
    },
    registrado_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Venda',
    tableName: 'vendas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Venda;
