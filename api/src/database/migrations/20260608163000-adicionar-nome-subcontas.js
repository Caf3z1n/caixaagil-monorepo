module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('subcontas')) {
      return;
    }

    const subcontas = await queryInterface.describeTable('subcontas');

    if (!subcontas.nome) {
      await queryInterface.addColumn('subcontas', 'nome', {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: 'Acesso',
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('subcontas')) {
      return;
    }

    const subcontas = await queryInterface.describeTable('subcontas');

    if (subcontas.nome) {
      await queryInterface.removeColumn('subcontas', 'nome');
    }
  },
};
