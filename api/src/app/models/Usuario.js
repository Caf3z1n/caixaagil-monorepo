const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../../database');

class Usuario extends Model {
  checkPassword(senha) {
    return bcrypt.compare(senha || '', this.senha_hash || '');
  }
}

Usuario.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    senha: {
      type: DataTypes.VIRTUAL,
    },
    senha_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    email_verificado_em: {
      type: DataTypes.DATE,
    },
    token_verificacao_email: {
      type: DataTypes.STRING,
    },
    token_verificacao_email_expira_em: {
      type: DataTypes.DATE,
    },
    token_redefinicao_senha: {
      type: DataTypes.STRING,
    },
    token_redefinicao_senha_expira_em: {
      type: DataTypes.DATE,
    },
    novo_email_pendente: {
      type: DataTypes.STRING,
    },
    token_troca_email: {
      type: DataTypes.STRING,
    },
    token_troca_email_expira_em: {
      type: DataTypes.DATE,
    },
    onboarding_concluido_em: {
      type: DataTypes.DATE,
    },
    codigo_acesso_suporte_hash: {
      type: DataTypes.STRING(64),
    },
    codigo_acesso_suporte_expira_em: {
      type: DataTypes.DATE,
    },
    codigo_acesso_suporte_admin_id: {
      type: DataTypes.INTEGER,
    },
  },
  {
    sequelize,
    modelName: 'Usuario',
    tableName: 'usuarios',
    timestamps: true,
    underscored: true,
    defaultScope: {
      attributes: {
        exclude: [
          'senha_hash',
          'token_verificacao_email',
          'token_verificacao_email_expira_em',
          'token_redefinicao_senha',
          'token_redefinicao_senha_expira_em',
          'token_troca_email',
          'token_troca_email_expira_em',
          'codigo_acesso_suporte_hash',
          'codigo_acesso_suporte_expira_em',
          'codigo_acesso_suporte_admin_id',
        ],
      },
    },
    scopes: {
      withSenha: {
        attributes: {
          include: [
            'senha_hash',
            'token_verificacao_email',
            'token_verificacao_email_expira_em',
            'token_redefinicao_senha',
            'token_redefinicao_senha_expira_em',
            'token_troca_email',
            'token_troca_email_expira_em',
          ],
        },
      },
      withAcessoSuporte: {
        attributes: {
          include: [
            'codigo_acesso_suporte_hash',
            'codigo_acesso_suporte_expira_em',
            'codigo_acesso_suporte_admin_id',
          ],
        },
      },
    },
  }
);

Usuario.addHook('beforeValidate', async usuario => {
  if (usuario.senha) {
    usuario.senha_hash = await bcrypt.hash(usuario.senha, 10);
  }
});

module.exports = Usuario;
