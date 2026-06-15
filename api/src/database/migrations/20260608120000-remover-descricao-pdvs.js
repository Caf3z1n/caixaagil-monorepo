module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('pdvs')) {
      return;
    }

    const pdvs = await queryInterface.describeTable('pdvs');

    if (pdvs.descricao) {
      await queryInterface.removeColumn('pdvs', 'descricao');
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('pdvs')) {
      return;
    }

    const pdvs = await queryInterface.describeTable('pdvs');

    if (!pdvs.descricao) {
      await queryInterface.addColumn('pdvs', 'descricao', {
        type: Sequelize.STRING(160),
        allowNull: true,
      });
    }
  },
};
