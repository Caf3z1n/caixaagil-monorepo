async function getTableColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return {};
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const usuarios = await getTableColumns(queryInterface, 'usuarios');

    if (!usuarios.codigo_acesso_suporte_hash) {
      await queryInterface.addColumn('usuarios', 'codigo_acesso_suporte_hash', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }

    if (!usuarios.codigo_acesso_suporte_expira_em) {
      await queryInterface.addColumn('usuarios', 'codigo_acesso_suporte_expira_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!usuarios.codigo_acesso_suporte_admin_id) {
      await queryInterface.addColumn('usuarios', 'codigo_acesso_suporte_admin_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const usuarios = await getTableColumns(queryInterface, 'usuarios');

    for (const column of [
      'codigo_acesso_suporte_admin_id',
      'codigo_acesso_suporte_expira_em',
      'codigo_acesso_suporte_hash',
    ]) {
      if (usuarios[column]) {
        await queryInterface.removeColumn('usuarios', column);
      }
    }
  },
};
