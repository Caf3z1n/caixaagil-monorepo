module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('subcontas')) {
      return;
    }

    await queryInterface.createTable('subcontas', {
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
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      nome: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      senha_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      permissoes: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      ativo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      token_redefinicao_senha: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      token_redefinicao_senha_expira_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      ultimo_acesso_em: {
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

    await queryInterface.addIndex('subcontas', ['usuario_id'], {
      name: 'subcontas_usuario_id_idx',
    });

    await queryInterface.addIndex('subcontas', ['email'], {
      name: 'subcontas_email_unique',
      unique: true,
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('subcontas')) {
      await queryInterface.dropTable('subcontas');
    }
  },
};
