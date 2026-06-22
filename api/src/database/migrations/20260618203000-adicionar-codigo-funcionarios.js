const { createHash } = require('crypto');

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.includes(tableName);
}

async function columnExists(queryInterface, tableName, columnName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const columns = await queryInterface.describeTable(tableName);
  return Boolean(columns[columnName]);
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  if (!(await columnExists(queryInterface, tableName, columnName))) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  if (await columnExists(queryInterface, tableName, columnName)) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

function hashCode(value) {
  return createHash('sha256').update(value).digest('hex');
}

function buildFourDigitCodeByHash() {
  const codeByHash = new Map();

  for (let index = 0; index <= 9999; index += 1) {
    const code = String(index).padStart(4, '0');
    codeByHash.set(hashCode(code), code);
  }

  return codeByHash;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'funcionarios', 'codigo', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    if (!(await tableExists(queryInterface, 'funcionarios'))) {
      return;
    }

    const [funcionarios] = await queryInterface.sequelize.query(
      'SELECT id, codigo_hash FROM funcionarios WHERE codigo IS NULL AND codigo_hash IS NOT NULL'
    );
    const codeByHash = buildFourDigitCodeByHash();

    for (const funcionario of funcionarios) {
      const codigo = codeByHash.get(funcionario.codigo_hash);

      if (!codigo) {
        continue;
      }

      await queryInterface.sequelize.query(
        'UPDATE funcionarios SET codigo = :codigo WHERE id = :id',
        {
          replacements: {
            id: funcionario.id,
            codigo,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    await removeColumnIfExists(queryInterface, 'funcionarios', 'codigo');
  },
};
