module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('pdvs')) {
      return;
    }

    const indexes = await queryInterface.showIndex('pdvs');
    const hasIdentificacaoIndex = indexes.some(index => index.name === 'pdvs_usuario_identificacao_unique');

    if (hasIdentificacaoIndex) {
      await queryInterface.removeIndex('pdvs', 'pdvs_usuario_identificacao_unique');
    }

    const pdvs = await queryInterface.describeTable('pdvs');

    if (pdvs.identificacao) {
      await queryInterface.removeColumn('pdvs', 'identificacao');
    }

    if (pdvs.sistema_operacional) {
      await queryInterface.removeColumn('pdvs', 'sistema_operacional');
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('pdvs')) {
      return;
    }

    const pdvs = await queryInterface.describeTable('pdvs');

    if (!pdvs.identificacao) {
      await queryInterface.addColumn('pdvs', 'identificacao', {
        type: Sequelize.STRING(32),
        allowNull: true,
      });
    }

    if (!pdvs.sistema_operacional) {
      await queryInterface.addColumn('pdvs', 'sistema_operacional', {
        type: Sequelize.STRING(80),
        allowNull: true,
      });
    }
  },
};
