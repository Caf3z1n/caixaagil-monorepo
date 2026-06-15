module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('usuarios', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      senha_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      ativo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      email_verificado_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      token_verificacao_email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      token_verificacao_email_expira_em: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      token_redefinicao_senha: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      token_redefinicao_senha_expira_em: {
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('usuarios');
  },
};
