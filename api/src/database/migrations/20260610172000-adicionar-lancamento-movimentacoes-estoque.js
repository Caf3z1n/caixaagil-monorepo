module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('movimentacoes_estoque')) {
      return;
    }

    const table = await queryInterface.describeTable('movimentacoes_estoque');

    if (!table.lancamento_id) {
      await queryInterface.addColumn('movimentacoes_estoque', 'lancamento_id', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }

    const indexes = await queryInterface.showIndex('movimentacoes_estoque');
    const hasIndex = indexes.some(index => index.name === 'movimentacoes_estoque_usuario_lancamento_idx');

    if (!hasIndex) {
      await queryInterface.addIndex('movimentacoes_estoque', ['usuario_id', 'lancamento_id'], {
        name: 'movimentacoes_estoque_usuario_lancamento_idx',
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('movimentacoes_estoque')) {
      return;
    }

    const table = await queryInterface.describeTable('movimentacoes_estoque');
    const indexes = await queryInterface.showIndex('movimentacoes_estoque');
    const hasIndex = indexes.some(index => index.name === 'movimentacoes_estoque_usuario_lancamento_idx');

    if (hasIndex) {
      await queryInterface.removeIndex('movimentacoes_estoque', 'movimentacoes_estoque_usuario_lancamento_idx');
    }

    if (table.lancamento_id) {
      await queryInterface.removeColumn('movimentacoes_estoque', 'lancamento_id');
    }
  },
};
