async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
}

async function getTableColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return {};
  }
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(index => index.name === options.name);

  if (!exists) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeIndexIfExists(queryInterface, tableName, indexName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return;
  }

  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(index => index.name === indexName);

  if (exists) {
    await queryInterface.removeIndex(tableName, indexName);
  }
}

async function seedPlano(queryInterface, plano) {
  await queryInterface.sequelize.query(
    `
      INSERT INTO planos (id, nome, descricao, ativo, publico, ordem, created_at, updated_at)
      VALUES (:id, :nome, :descricao, true, true, :ordem, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        nome = EXCLUDED.nome,
        descricao = EXCLUDED.descricao,
        ativo = EXCLUDED.ativo,
        publico = EXCLUDED.publico,
        ordem = EXCLUDED.ordem,
        updated_at = NOW();
    `,
    { replacements: plano }
  );

  await queryInterface.sequelize.query(
    `
      INSERT INTO plano_versoes (
        plano_id,
        nome,
        descricao,
        valor_centavos,
        moeda,
        intervalo,
        intervalo_quantidade,
        ativo,
        vigente_de,
        created_at,
        updated_at
      )
      SELECT
        :id,
        :nome,
        :descricao,
        :valor_centavos,
        'BRL',
        'mensal',
        1,
        true,
        NOW(),
        NOW(),
        NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM plano_versoes
        WHERE plano_id = :id
          AND ativo = true
          AND vigente_ate IS NULL
      );
    `,
    { replacements: plano }
  );
}

async function seedRecursosELimites(queryInterface, planos) {
  const [versoes] = await queryInterface.sequelize.query(
    `
      SELECT DISTINCT ON (plano_id) id, plano_id
      FROM plano_versoes
      WHERE plano_id IN (:ids)
        AND ativo = true
      ORDER BY plano_id, vigente_de DESC, id DESC;
    `,
    { replacements: { ids: planos.map(plano => plano.id) } }
  );

  const versaoPorPlano = new Map(versoes.map(versao => [versao.plano_id, versao.id]));
  const versaoIds = versoes.map(versao => versao.id);

  if (versaoIds.length === 0) {
    return;
  }

  await queryInterface.bulkDelete('plano_recursos', { plano_versao_id: versaoIds });
  await queryInterface.bulkDelete('plano_limites', { plano_versao_id: versaoIds });

  const now = new Date();
  const recursos = [];
  const limites = [];

  for (const plano of planos) {
    const planoVersaoId = versaoPorPlano.get(plano.id);

    if (!planoVersaoId) {
      continue;
    }

    plano.recursos.forEach((recurso, index) => {
      recursos.push({
        plano_versao_id: planoVersaoId,
        codigo: recurso.codigo,
        nome: recurso.nome,
        habilitado: recurso.habilitado,
        ordem: index + 1,
        created_at: now,
        updated_at: now,
      });
    });

    plano.limites.forEach((limite, index) => {
      limites.push({
        plano_versao_id: planoVersaoId,
        codigo: limite.codigo,
        nome: limite.nome,
        valor: limite.valor,
        unidade: limite.unidade,
        ordem: index + 1,
        created_at: now,
        updated_at: now,
      });
    });
  }

  if (recursos.length > 0) {
    await queryInterface.bulkInsert('plano_recursos', recursos);
  }

  if (limites.length > 0) {
    await queryInterface.bulkInsert('plano_limites', limites);
  }
}

const planosBase = [
  {
    id: 'inicial',
    nome: 'Inicial',
    descricao: 'Operacao comercial com PDV, vendas, comandas, estoque e fechamento do turno sem emissao fiscal.',
    valor_centavos: 29900,
    ordem: 1,
    recursos: [
      { codigo: 'pdv_desktop', nome: 'PDV desktop local', habilitado: true },
      { codigo: 'vendas_comandas', nome: 'Vendas e comanda digital', habilitado: true },
      { codigo: 'estoque', nome: 'Controle de estoque', habilitado: true },
      { codigo: 'fechamento_turno', nome: 'Fechamento do turno', habilitado: true },
      { codigo: 'emissao_fiscal', nome: 'NF-e/NFC-e com contingencia', habilitado: false },
    ],
    limites: [
      { codigo: 'pdvs_ativos', nome: 'PDVs ativos', valor: null, unidade: 'quantidade' },
      { codigo: 'subcontas_ativas', nome: 'Subcontas ativas', valor: null, unidade: 'quantidade' },
    ],
  },
  {
    id: 'completo',
    nome: 'Completo',
    descricao: 'Operacao comercial completa com PDV, estoque, fechamento do turno e emissao fiscal.',
    valor_centavos: 49900,
    ordem: 2,
    recursos: [
      { codigo: 'pdv_desktop', nome: 'PDV desktop local', habilitado: true },
      { codigo: 'vendas_comandas', nome: 'Vendas e comanda digital', habilitado: true },
      { codigo: 'estoque', nome: 'Controle de estoque', habilitado: true },
      { codigo: 'fechamento_turno', nome: 'Fechamento do turno', habilitado: true },
      { codigo: 'emissao_fiscal', nome: 'NF-e/NFC-e com contingencia', habilitado: true },
    ],
    limites: [
      { codigo: 'pdvs_ativos', nome: 'PDVs ativos', valor: null, unidade: 'quantidade' },
      { codigo: 'subcontas_ativas', nome: 'Subcontas ativas', valor: null, unidade: 'quantidade' },
    ],
  },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'planos'))) {
      await queryInterface.createTable('planos', {
        id: {
          type: Sequelize.STRING(60),
          allowNull: false,
          primaryKey: true,
        },
        nome: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        descricao: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        ativo: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        publico: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        ordem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
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
    }

    if (!(await tableExists(queryInterface, 'plano_versoes'))) {
      await queryInterface.createTable('plano_versoes', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        plano_id: {
          type: Sequelize.STRING(60),
          allowNull: false,
          references: {
            model: 'planos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        nome: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        descricao: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        valor_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        moeda: {
          type: Sequelize.STRING(3),
          allowNull: false,
          defaultValue: 'BRL',
        },
        intervalo: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'mensal',
        },
        intervalo_quantidade: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        ativo: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        vigente_de: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        vigente_ate: {
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
    }

    if (!(await tableExists(queryInterface, 'plano_recursos'))) {
      await queryInterface.createTable('plano_recursos', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        plano_versao_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'plano_versoes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        codigo: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        nome: {
          type: Sequelize.STRING(140),
          allowNull: false,
        },
        habilitado: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        ordem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
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
    }

    if (!(await tableExists(queryInterface, 'plano_limites'))) {
      await queryInterface.createTable('plano_limites', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        plano_versao_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'plano_versoes',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        codigo: {
          type: Sequelize.STRING(80),
          allowNull: false,
        },
        nome: {
          type: Sequelize.STRING(140),
          allowNull: false,
        },
        valor: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        unidade: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        ordem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
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
    }

    await addIndexIfMissing(queryInterface, 'planos', ['ativo', 'publico', 'ordem'], {
      name: 'planos_ativo_publico_ordem_idx',
    });
    await addIndexIfMissing(queryInterface, 'plano_versoes', ['plano_id', 'ativo', 'vigente_de'], {
      name: 'plano_versoes_plano_ativo_vigencia_idx',
    });
    await addIndexIfMissing(queryInterface, 'plano_recursos', ['plano_versao_id', 'codigo'], {
      name: 'plano_recursos_versao_codigo_unique',
      unique: true,
    });
    await addIndexIfMissing(queryInterface, 'plano_limites', ['plano_versao_id', 'codigo'], {
      name: 'plano_limites_versao_codigo_unique',
      unique: true,
    });

    for (const plano of planosBase) {
      await seedPlano(queryInterface, plano);
    }

    await seedRecursosELimites(queryInterface, planosBase);

    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (!assinaturas.plano_versao_id) {
      await queryInterface.addColumn('assinaturas', 'plano_versao_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'plano_versoes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!assinaturas.plano_snapshot) {
      await queryInterface.addColumn('assinaturas', 'plano_snapshot', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const assinaturas = await getTableColumns(queryInterface, 'assinaturas');

    if (assinaturas.plano_snapshot) {
      await queryInterface.removeColumn('assinaturas', 'plano_snapshot');
    }

    if (assinaturas.plano_versao_id) {
      await queryInterface.removeColumn('assinaturas', 'plano_versao_id');
    }

    await removeIndexIfExists(queryInterface, 'plano_limites', 'plano_limites_versao_codigo_unique');
    await removeIndexIfExists(queryInterface, 'plano_recursos', 'plano_recursos_versao_codigo_unique');
    await removeIndexIfExists(queryInterface, 'plano_versoes', 'plano_versoes_plano_ativo_vigencia_idx');
    await removeIndexIfExists(queryInterface, 'planos', 'planos_ativo_publico_ordem_idx');

    if (await tableExists(queryInterface, 'plano_limites')) {
      await queryInterface.dropTable('plano_limites');
    }

    if (await tableExists(queryInterface, 'plano_recursos')) {
      await queryInterface.dropTable('plano_recursos');
    }

    if (await tableExists(queryInterface, 'plano_versoes')) {
      await queryInterface.dropTable('plano_versoes');
    }

    if (await tableExists(queryInterface, 'planos')) {
      await queryInterface.dropTable('planos');
    }
  },
};
