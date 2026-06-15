async function getTableColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return {};
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (!assinaturas.tipo_movimento) {
      await queryInterface.addColumn('assinaturas', 'tipo_movimento', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!assinaturas.assinatura_anterior_id) {
      await queryInterface.addColumn('assinaturas', 'assinatura_anterior_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'assinaturas',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!assinaturas.valor_recorrente_centavos) {
      await queryInterface.addColumn('assinaturas', 'valor_recorrente_centavos', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!assinaturas.valor_primeiro_pagamento_centavos) {
      await queryInterface.addColumn('assinaturas', 'valor_primeiro_pagamento_centavos', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!assinaturas.credito_rateio_centavos) {
      await queryInterface.addColumn('assinaturas', 'credito_rateio_centavos', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!assinaturas.normalizar_valor_apos_primeiro_pagamento) {
      await queryInterface.addColumn('assinaturas', 'normalizar_valor_apos_primeiro_pagamento', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!assinaturas.valor_normalizado_em) {
      await queryInterface.addColumn('assinaturas', 'valor_normalizado_em', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (assinaturas.valor_normalizado_em) {
      await queryInterface.removeColumn('assinaturas', 'valor_normalizado_em');
    }

    if (assinaturas.normalizar_valor_apos_primeiro_pagamento) {
      await queryInterface.removeColumn('assinaturas', 'normalizar_valor_apos_primeiro_pagamento');
    }

    if (assinaturas.credito_rateio_centavos) {
      await queryInterface.removeColumn('assinaturas', 'credito_rateio_centavos');
    }

    if (assinaturas.valor_primeiro_pagamento_centavos) {
      await queryInterface.removeColumn('assinaturas', 'valor_primeiro_pagamento_centavos');
    }

    if (assinaturas.valor_recorrente_centavos) {
      await queryInterface.removeColumn('assinaturas', 'valor_recorrente_centavos');
    }

    if (assinaturas.assinatura_anterior_id) {
      await queryInterface.removeColumn('assinaturas', 'assinatura_anterior_id');
    }

    if (assinaturas.tipo_movimento) {
      await queryInterface.removeColumn('assinaturas', 'tipo_movimento');
    }
  },
};
