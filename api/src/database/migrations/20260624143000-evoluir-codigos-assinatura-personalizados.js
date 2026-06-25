const crypto = require('crypto');

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

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await getTableColumns(queryInterface, tableName);

  if (!columns[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const columns = await getTableColumns(queryInterface, tableName);

  if (columns[columnName]) {
    await queryInterface.removeColumn(tableName, columnName);
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

function normalizeCodigo(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (raw.length === 6) {
    return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  }

  return raw.slice(0, 80);
}

function hashCodigo(value) {
  return crypto.createHash('sha256').update(normalizeCodigo(value)).digest('hex');
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'codigos_assinatura'))) {
      return;
    }

    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'codigo_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'gratuito', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'cobranca_inicio_em', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'intervalo', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'mensal',
    });
    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'intervalo_quantidade', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'usado_por_usuario_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'usuarios',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await addColumnIfMissing(queryInterface, 'codigos_assinatura', 'usado_em', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    const [codigos] = await queryInterface.sequelize.query(
      'SELECT id, codigo, codigo_hash FROM codigos_assinatura WHERE codigo_hash IS NULL OR codigo_hash = \'\''
    );

    for (const codigo of codigos) {
      await queryInterface.sequelize.query(
        'UPDATE codigos_assinatura SET codigo_hash = :codigo_hash WHERE id = :id',
        {
          replacements: {
            id: codigo.id,
            codigo_hash: hashCodigo(codigo.codigo),
          },
        }
      );
    }

    await queryInterface.sequelize.query(
      `
        UPDATE codigos_assinatura
        SET usos_maximos = 1
        WHERE usos_maximos IS NULL OR usos_maximos < 1;
      `
    );

    await queryInterface.changeColumn('codigos_assinatura', 'codigo_hash', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });

    await addIndexIfMissing(queryInterface, 'codigos_assinatura', ['codigo_hash'], {
      name: 'codigos_assinatura_codigo_hash_unique',
      unique: true,
    });
    await addIndexIfMissing(queryInterface, 'codigos_assinatura', ['usado_por_usuario_id'], {
      name: 'codigos_assinatura_usuario_usado_idx',
    });
    await addIndexIfMissing(queryInterface, 'codigos_assinatura', ['ativo', 'usado_em'], {
      name: 'codigos_assinatura_ativo_usado_idx',
    });
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'codigos_assinatura'))) {
      return;
    }

    await removeIndexIfExists(queryInterface, 'codigos_assinatura', 'codigos_assinatura_ativo_usado_idx');
    await removeIndexIfExists(queryInterface, 'codigos_assinatura', 'codigos_assinatura_usuario_usado_idx');
    await removeIndexIfExists(queryInterface, 'codigos_assinatura', 'codigos_assinatura_codigo_hash_unique');

    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'usado_em');
    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'usado_por_usuario_id');
    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'intervalo_quantidade');
    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'intervalo');
    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'cobranca_inicio_em');
    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'gratuito');
    await removeColumnIfExists(queryInterface, 'codigos_assinatura', 'codigo_hash');
  },
};
