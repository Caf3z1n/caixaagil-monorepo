const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../../database');

class Subconta extends Model {
  checkPassword(senha) {
    return bcrypt.compare(senha || '', this.senha_hash || '');
  }
}

Subconta.init(
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    nome: {
      type: DataTypes.STRING(80),
      allowNull: false,
      validate: {
        len: [2, 80],
      },
    },
    senha: {
      type: DataTypes.VIRTUAL,
    },
    senha_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permissoes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    token_redefinicao_senha: {
      type: DataTypes.STRING,
    },
    token_redefinicao_senha_expira_em: {
      type: DataTypes.DATE,
    },
    ultimo_acesso_em: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'Subconta',
    tableName: 'subcontas',
    timestamps: true,
    underscored: true,
    defaultScope: {
      attributes: {
        exclude: [
          'senha_hash',
          'token_redefinicao_senha',
          'token_redefinicao_senha_expira_em',
        ],
      },
    },
    scopes: {
      withSenha: {
        attributes: {
          include: [
            'senha_hash',
            'token_redefinicao_senha',
            'token_redefinicao_senha_expira_em',
          ],
        },
      },
    },
  }
);

Subconta.addHook('beforeValidate', async subconta => {
  if (subconta.senha) {
    subconta.senha_hash = await bcrypt.hash(subconta.senha, 10);
  }
});

module.exports = Subconta;
