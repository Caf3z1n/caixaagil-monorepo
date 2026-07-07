async function columnExists(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'vendas', 'parcelamento'))) {
      await queryInterface.addColumn('vendas', 'parcelamento', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }

    if (!(await columnExists(queryInterface, 'conferencias_caixa', 'parcelamento_confirmado_centavos'))) {
      await queryInterface.addColumn('conferencias_caixa', 'parcelamento_confirmado_centavos', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    if (await columnExists(queryInterface, 'conferencias_caixa', 'parcelamento_confirmado_centavos')) {
      await queryInterface.removeColumn('conferencias_caixa', 'parcelamento_confirmado_centavos');
    }

    if (await columnExists(queryInterface, 'vendas', 'parcelamento')) {
      await queryInterface.removeColumn('vendas', 'parcelamento');
    }
  },
};
