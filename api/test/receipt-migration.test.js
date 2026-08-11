const assert = require('node:assert/strict');
const test = require('node:test');
const migration = require('../src/database/migrations/20260811120000-criar-recebimentos-vendas');

const Sequelize = {
  DATE: 'DATE',
  INTEGER: 'INTEGER',
  JSONB: 'JSONB',
  Op: {
    gt: Symbol('gt'),
    in: Symbol('in'),
  },
  STRING(length) {
    return `STRING(${length})`;
  },
  literal(value) {
    return value;
  },
};

function makeQueryInterface(existingTables = []) {
  const transaction = { id: 'migration-transaction' };
  const calls = [];
  const queryInterface = {
    sequelize: {
      async transaction(callback) {
        calls.push(['transaction']);
        return callback(transaction);
      },
      async query(_sql, options) {
        calls.push(['query', options]);
      },
    },
    async showAllTables(options) {
      calls.push(['showAllTables', options]);
      return existingTables;
    },
    async createTable(_table, _columns, options) {
      calls.push(['createTable', options]);
    },
    async addIndex(_table, _fields, options) {
      calls.push(['addIndex', options]);
    },
    async addConstraint(_table, options) {
      calls.push(['addConstraint', options]);
    },
  };

  return { calls, queryInterface, transaction };
}

test('cria tabela, índices e constraints na mesma transação atômica', async () => {
  const { calls, queryInterface, transaction } = makeQueryInterface();

  await migration.up(queryInterface, Sequelize);

  const ddlCalls = calls.filter(([name]) => [
    'showAllTables',
    'createTable',
    'addIndex',
    'addConstraint',
    'query',
  ].includes(name));

  assert.ok(ddlCalls.length > 1);
  ddlCalls.forEach(([, options]) => assert.equal(options.transaction, transaction));
});

test('é idempotente quando a tabela já existe', async () => {
  const { calls, queryInterface } = makeQueryInterface(['recebimentos_vendas']);

  await migration.up(queryInterface, Sequelize);

  assert.deepEqual(calls.map(([name]) => name), ['transaction', 'showAllTables']);
});
