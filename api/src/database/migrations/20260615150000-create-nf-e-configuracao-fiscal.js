function normalizeTableName(table) {
  if (typeof table === 'string') {
    return table;
  }

  return table?.tableName || table?.name || '';
}

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();

  return tables.map(normalizeTableName).includes(tableName);
}

async function getTableColumns(queryInterface, tableName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return {};
  }

  return queryInterface.describeTable(tableName);
}

async function columnExists(queryInterface, tableName, columnName) {
  const columns = await getTableColumns(queryInterface, tableName);

  return Boolean(columns[columnName]);
}

async function indexExists(queryInterface, tableName, indexName) {
  if (!(await tableExists(queryInterface, tableName))) {
    return false;
  }

  const indexes = await queryInterface.showIndex(tableName);

  return indexes.some(index => index.name === indexName);
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  if (!(await indexExists(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if ((await tableExists(queryInterface, 'configuracoes')) && !(await columnExists(queryInterface, 'configuracoes', 'fiscal'))) {
      await queryInterface.addColumn('configuracoes', 'fiscal', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      });
    }

    if (!(await tableExists(queryInterface, 'nf'))) {
      await queryInterface.createTable('nf', {
        id: {
          type: Sequelize.STRING(64),
          allowNull: false,
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
        venda_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          references: {
            model: 'vendas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        pdv_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'pdvs',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        caixa_id: {
          type: Sequelize.STRING(64),
          allowNull: true,
          references: {
            model: 'caixas',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        ambiente: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'homologacao',
        },
        modelo: {
          type: Sequelize.STRING(2),
          allowNull: false,
          defaultValue: '65',
        },
        serie: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        numero: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        chave_acesso: {
          type: Sequelize.STRING(44),
          allowNull: true,
        },
        status: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'rascunho',
        },
        tipo_emissao: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'normal',
        },
        finalidade: {
          type: Sequelize.STRING(24),
          allowNull: false,
          defaultValue: 'normal',
        },
        natureza_operacao: {
          type: Sequelize.STRING(120),
          allowNull: false,
          defaultValue: 'Venda',
        },
        total_centavos: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        protocolo_autorizacao: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        protocolo_cancelamento: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        codigo_retorno_sefaz: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        mensagem_retorno_sefaz: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        ultimo_erro_tecnico: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        xml_enviado_arquivo_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'arquivos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        xml_autorizado_arquivo_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'arquivos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        danfe_pdf_arquivo_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'arquivos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        payload: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        retorno_sefaz: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        eventos: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        emitida_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        autorizada_em: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        cancelada_em: {
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

    await addIndexIfMissing(queryInterface, 'nf', ['usuario_id', 'ambiente', 'modelo', 'serie', 'numero'], {
      name: 'nf_usuario_ambiente_modelo_serie_numero_unique',
      unique: true,
    });
    await addIndexIfMissing(queryInterface, 'nf', ['usuario_id', 'status', 'created_at'], {
      name: 'nf_usuario_status_created_at_idx',
    });
    await addIndexIfMissing(queryInterface, 'nf', ['usuario_id', 'venda_id'], {
      name: 'nf_usuario_venda_id_idx',
    });
    await addIndexIfMissing(queryInterface, 'nf', ['usuario_id', 'chave_acesso'], {
      name: 'nf_usuario_chave_acesso_idx',
    });

    if (!(await tableExists(queryInterface, 'nf_eventos'))) {
      await queryInterface.createTable('nf_eventos', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        nf_id: {
          type: Sequelize.STRING(64),
          allowNull: false,
          references: {
            model: 'nf',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
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
        tipo: {
          type: Sequelize.STRING(32),
          allowNull: false,
        },
        status: {
          type: Sequelize.STRING(32),
          allowNull: false,
        },
        codigo_retorno_sefaz: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        mensagem: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        arquivo_xml_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'arquivos',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        detalhes: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        ocorrido_em: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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

    await addIndexIfMissing(queryInterface, 'nf_eventos', ['usuario_id', 'nf_id', 'ocorrido_em'], {
      name: 'nf_eventos_usuario_nf_ocorrido_em_idx',
    });
    await addIndexIfMissing(queryInterface, 'nf_eventos', ['usuario_id', 'tipo'], {
      name: 'nf_eventos_usuario_tipo_idx',
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'nf_eventos')) {
      await queryInterface.dropTable('nf_eventos');
    }

    if (await tableExists(queryInterface, 'nf')) {
      await queryInterface.dropTable('nf');
    }
  },
};
