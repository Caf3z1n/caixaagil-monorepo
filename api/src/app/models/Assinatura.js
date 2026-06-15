const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Assinatura extends Model {}

Assinatura.init(
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
    plano: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pendente',
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
    mercado_pago_preapproval_id: {
      type: DataTypes.STRING,
    },
    referencia_externa: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    checkout_url: {
      type: DataTypes.TEXT,
    },
    email_pagador: {
      type: DataTypes.STRING,
    },
    iniciada_em: {
      type: DataTypes.DATE,
    },
    ativada_em: {
      type: DataTypes.DATE,
    },
    proximo_pagamento_em: {
      type: DataTypes.DATE,
    },
    cancelada_em: {
      type: DataTypes.DATE,
    },
    tipo_movimento: {
      type: DataTypes.STRING,
    },
    assinatura_anterior_id: {
      type: DataTypes.INTEGER,
    },
    valor_recorrente_centavos: {
      type: DataTypes.INTEGER,
    },
    valor_primeiro_pagamento_centavos: {
      type: DataTypes.INTEGER,
    },
    credito_rateio_centavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    normalizar_valor_apos_primeiro_pagamento: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    valor_normalizado_em: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'Assinatura',
    tableName: 'assinaturas',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Assinatura;
