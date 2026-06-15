module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('grupos_fiscais')) {
      return;
    }

    await queryInterface.createTable('grupos_fiscais', {
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
      nome: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      icone: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'package',
      },
      regime_tributario: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'simples_nacional',
      },
      ativo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      ncm: {
        type: Sequelize.STRING(8),
        allowNull: true,
      },
      cfop: {
        type: Sequelize.STRING(4),
        allowNull: false,
      },
      cst_icms: {
        type: Sequelize.STRING(2),
        allowNull: true,
      },
      csosn: {
        type: Sequelize.STRING(3),
        allowNull: true,
      },
      aliquota_icms: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      reducao_icms: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      base_icms_st: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      cst_pis: {
        type: Sequelize.STRING(2),
        allowNull: false,
      },
      aliquota_pis: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      cst_cofins: {
        type: Sequelize.STRING(2),
        allowNull: false,
      },
      aliquota_cofins: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      ibs_ativo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cst_ibs: {
        type: Sequelize.STRING(3),
        allowNull: true,
      },
      classificacao_ibs: {
        type: Sequelize.STRING(6),
        allowNull: true,
      },
      aliquota_ibs_uf: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      aliquota_ibs_municipal: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
      },
      aliquota_cbs: {
        type: Sequelize.DECIMAL(8, 4),
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

    await queryInterface.addIndex('grupos_fiscais', ['usuario_id'], {
      name: 'grupos_fiscais_usuario_id_idx',
    });

    await queryInterface.addIndex('grupos_fiscais', ['usuario_id', 'nome'], {
      name: 'grupos_fiscais_usuario_nome_unique',
      unique: true,
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes('grupos_fiscais')) {
      await queryInterface.dropTable('grupos_fiscais');
    }
  },
};
