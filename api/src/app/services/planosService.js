const planos = {
  inicial: {
    id: 'inicial',
    nome: 'Inicial',
    valor_centavos: 29900,
  },
  completo: {
    id: 'completo',
    nome: 'Completo',
    valor_centavos: 49900,
  },
};

function getPlano(id) {
  return planos[String(id || '').toLowerCase()] || null;
}

function getValorEmReais(plano) {
  return plano.valor_centavos / 100;
}

module.exports = {
  getPlano,
  getValorEmReais,
  planos,
};
