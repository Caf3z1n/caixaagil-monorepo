module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('usuarios')) {
      const usuarios = await queryInterface.describeTable('usuarios');

      if (usuarios.name) {
        await queryInterface.removeColumn('usuarios', 'name');
      }

      if (usuarios.role) {
        await queryInterface.removeColumn('usuarios', 'role');
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_usuarios_role";');
      }

      if (usuarios.password_hash && !usuarios.senha_hash) {
        await queryInterface.renameColumn('usuarios', 'password_hash', 'senha_hash');
      }

      if (usuarios.active && !usuarios.ativo) {
        await queryInterface.renameColumn('usuarios', 'active', 'ativo');
      }

      const usuariosAtualizado = await queryInterface.describeTable('usuarios');

      if (!usuariosAtualizado.email_verificado_em) {
        await queryInterface.addColumn('usuarios', 'email_verificado_em', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }

      if (!usuariosAtualizado.token_verificacao_email) {
        await queryInterface.addColumn('usuarios', 'token_verificacao_email', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }

      if (!usuariosAtualizado.token_verificacao_email_expira_em) {
        await queryInterface.addColumn('usuarios', 'token_verificacao_email_expira_em', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }

      if (!usuariosAtualizado.token_redefinicao_senha) {
        await queryInterface.addColumn('usuarios', 'token_redefinicao_senha', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }

      if (!usuariosAtualizado.token_redefinicao_senha_expira_em) {
        await queryInterface.addColumn('usuarios', 'token_redefinicao_senha_expira_em', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }
    }

    const tabelasAtualizadas = await queryInterface.showAllTables();

    if (!tabelasAtualizadas.includes('assinaturas')) {
      await queryInterface.createTable('assinaturas', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        usuario_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'usuarios',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        plano: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: 'pendente',
        },
        valor_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        moeda: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'BRL',
        },
        mercado_pago_preapproval_id: {
          type: Sequelize.STRING,
          allowNull: true,
          unique: true,
        },
        referencia_externa: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        checkout_url: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        email_pagador: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        iniciada_em: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        ativada_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        cancelada_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('assinaturas')) {
      await queryInterface.dropTable('assinaturas');
    }

    if (!tables.includes('usuarios')) {
      return;
    }

    const usuarios = await queryInterface.describeTable('usuarios');

    if (usuarios.token_redefinicao_senha_expira_em) {
      await queryInterface.removeColumn('usuarios', 'token_redefinicao_senha_expira_em');
    }

    if (usuarios.token_redefinicao_senha) {
      await queryInterface.removeColumn('usuarios', 'token_redefinicao_senha');
    }

    if (usuarios.token_verificacao_email_expira_em) {
      await queryInterface.removeColumn('usuarios', 'token_verificacao_email_expira_em');
    }

    if (usuarios.token_verificacao_email) {
      await queryInterface.removeColumn('usuarios', 'token_verificacao_email');
    }

    if (usuarios.email_verificado_em) {
      await queryInterface.removeColumn('usuarios', 'email_verificado_em');
    }

    if (usuarios.senha_hash && !usuarios.password_hash) {
      await queryInterface.renameColumn('usuarios', 'senha_hash', 'password_hash');
    }

    if (usuarios.ativo && !usuarios.active) {
      await queryInterface.renameColumn('usuarios', 'ativo', 'active');
    }

    const usuariosAtualizado = await queryInterface.describeTable('usuarios');

    if (!usuariosAtualizado.name) {
      await queryInterface.addColumn('usuarios', 'name', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      });
    }

    if (!usuariosAtualizado.role) {
      await queryInterface.addColumn('usuarios', 'role', {
        type: Sequelize.ENUM('MASTER', 'ADMIN', 'CLIENTE'),
        allowNull: false,
        defaultValue: 'CLIENTE',
      });
    }
  },
};
