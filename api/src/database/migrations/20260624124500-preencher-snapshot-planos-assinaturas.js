module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE assinaturas AS assinatura
      SET
        plano_versao_id = COALESCE(assinatura.plano_versao_id, versao.id),
        plano_snapshot = COALESCE(
          assinatura.plano_snapshot,
          jsonb_build_object(
            'id', plano.id,
            'nome', versao.nome,
            'descricao', COALESCE(versao.descricao, plano.descricao),
            'valor_centavos', versao.valor_centavos,
            'moeda', versao.moeda,
            'intervalo', versao.intervalo,
            'intervalo_quantidade', versao.intervalo_quantidade,
            'plano_versao_id', versao.id,
            'recursos', COALESCE(recursos.items, '[]'::jsonb),
            'limites', COALESCE(limites.items, '[]'::jsonb),
            'capturado_em', NOW()
          )
        )
      FROM planos AS plano
      JOIN LATERAL (
        SELECT *
        FROM plano_versoes
        WHERE plano_id = plano.id
          AND ativo = true
          AND vigente_de <= NOW()
          AND (vigente_ate IS NULL OR vigente_ate > NOW())
        ORDER BY vigente_de DESC, id DESC
        LIMIT 1
      ) AS versao ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'codigo', codigo,
            'nome', nome,
            'label', nome,
            'habilitado', habilitado,
            'included', habilitado
          )
          ORDER BY ordem ASC, id ASC
        ) AS items
        FROM plano_recursos
        WHERE plano_versao_id = versao.id
      ) AS recursos ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'codigo', codigo,
            'nome', nome,
            'valor', valor,
            'unidade', unidade
          )
          ORDER BY ordem ASC, id ASC
        ) AS items
        FROM plano_limites
        WHERE plano_versao_id = versao.id
      ) AS limites ON true
      WHERE assinatura.plano = plano.id
        AND (assinatura.plano_versao_id IS NULL OR assinatura.plano_snapshot IS NULL);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE assinaturas
      SET
        plano_versao_id = NULL,
        plano_snapshot = NULL
      WHERE plano IN ('inicial', 'completo');
    `);
  },
};
