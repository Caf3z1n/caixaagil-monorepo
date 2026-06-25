const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../../database');

class Administrador extends Model {
  checkPassword(senha) {
    return bcrypt.compare(senha || '', this.senha_hash || '');
  }
}

Administrador.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nome: {
      type: DataTypes.STRING(100),
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
    ultimo_acesso_em: {
      type: DataTypes.DATE,
    },
  },
  {
    sequelize,
    modelName: 'Administrador',
    tableName: 'admin',
    timestamps: true,
    underscored: true,
    defaultScope: {
      attributes: {
        exclude: ['senha_hash'],
      },
    },
    scopes: {
      withSenha: {
        attributes: {
          include: ['senha_hash'],
        },
      },
    },
  }
);

Administrador.addHook('beforeValidate', async administrador => {
  if (administrador.senha) {
    administrador.senha_hash = await bcrypt.hash(administrador.senha, 10);
  }
});

module.exports = Administrador;
