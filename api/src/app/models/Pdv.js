const { DataTypes, Model } = require('sequelize');
const sequelize = require('../../database');

class Pdv extends Model {}

Pdv.init(
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
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'pendente',
    },
    dispositivo_id: {
      type: DataTypes.STRING,
    },
    credencial_hash: {
      type: DataTypes.STRING(64),
    },
    codigo_pareamento_hash: {
      type: DataTypes.STRING(64),
    },
    codigo_pareamento_expira_em: {
      type: DataTypes.DATE,
    },
    codigo_pareamento_usado_em: {
      type: DataTypes.DATE,
    },
    pareado_em: {
      type: DataTypes.DATE,
    },
    ultimo_acesso_em: {
      type: DataTypes.DATE,
    },
    ultima_sincronizacao_em: {
      type: DataTypes.DATE,
    },
    ultima_fila_offline_em: {
      type: DataTypes.DATE,
    },
    sincronizacao_pendente: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    suporte_remoto: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Pdv',
    tableName: 'pdvs',
    timestamps: true,
    underscored: true,
    defaultScope: {
      attributes: {
        exclude: ['credencial_hash', 'codigo_pareamento_hash'],
      },
    },
    scopes: {
      withSegredos: {
        attributes: {
          include: ['credencial_hash', 'codigo_pareamento_hash'],
        },
      },
    },
  }
);

module.exports = Pdv;
