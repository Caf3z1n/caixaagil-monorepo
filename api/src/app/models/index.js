const Usuario = require('./Usuario');
const Assinatura = require('./Assinatura');
const PagamentoAssinatura = require('./PagamentoAssinatura');
const Pdv = require('./Pdv');
const Subconta = require('./Subconta');
const GrupoFiscal = require('./GrupoFiscal');
const Arquivo = require('./Arquivo');
const CategoriaProduto = require('./CategoriaProduto');
const Produto = require('./Produto');
const Estoque = require('./Estoque');
const SaldoEstoqueProduto = require('./SaldoEstoqueProduto');
const MovimentacaoEstoque = require('./MovimentacaoEstoque');
const Caixa = require('./Caixa');
const Venda = require('./Venda');
const Nf = require('./Nf');
const NfEvento = require('./NfEvento');
const ClienteConvenio = require('./ClienteConvenio');
const DespesaCaixa = require('./DespesaCaixa');
const ConferenciaCaixa = require('./ConferenciaCaixa');
const EventoPdv = require('./EventoPdv');
const ConfiguracaoSistema = require('./ConfiguracaoSistema');
const Funcionario = require('./Funcionario');

Usuario.hasMany(Assinatura, {
  foreignKey: 'usuario_id',
  as: 'assinaturas',
});

Assinatura.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Assinatura.hasMany(PagamentoAssinatura, {
  foreignKey: 'assinatura_id',
  as: 'pagamentos',
});

PagamentoAssinatura.belongsTo(Assinatura, {
  foreignKey: 'assinatura_id',
  as: 'assinatura',
});

Usuario.hasMany(PagamentoAssinatura, {
  foreignKey: 'usuario_id',
  as: 'pagamentos_assinaturas',
});

PagamentoAssinatura.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(Pdv, {
  foreignKey: 'usuario_id',
  as: 'pdvs',
});

Pdv.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(Subconta, {
  foreignKey: 'usuario_id',
  as: 'subcontas',
});

Subconta.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(GrupoFiscal, {
  foreignKey: 'usuario_id',
  as: 'grupos_fiscais',
});

GrupoFiscal.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(Arquivo, {
  foreignKey: 'usuario_id',
  as: 'arquivos',
});

Arquivo.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(CategoriaProduto, {
  foreignKey: 'usuario_id',
  as: 'categorias_produtos',
});

CategoriaProduto.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(Produto, {
  foreignKey: 'usuario_id',
  as: 'produtos',
});

Produto.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

CategoriaProduto.hasMany(Produto, {
  foreignKey: 'categoria_id',
  as: 'produtos',
});

Produto.belongsTo(CategoriaProduto, {
  foreignKey: 'categoria_id',
  as: 'categoria',
});

GrupoFiscal.hasMany(Produto, {
  foreignKey: 'grupo_fiscal_id',
  as: 'produtos',
});

Produto.belongsTo(GrupoFiscal, {
  foreignKey: 'grupo_fiscal_id',
  as: 'grupo_fiscal',
});

Arquivo.hasMany(Produto, {
  foreignKey: 'imagem_arquivo_id',
  as: 'produtos_com_imagem',
});

Produto.belongsTo(Arquivo, {
  foreignKey: 'imagem_arquivo_id',
  as: 'imagem',
});

Usuario.hasMany(Estoque, {
  foreignKey: 'usuario_id',
  as: 'estoques',
});

Estoque.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(SaldoEstoqueProduto, {
  foreignKey: 'usuario_id',
  as: 'saldos_estoques_produtos',
});

SaldoEstoqueProduto.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Produto.hasMany(SaldoEstoqueProduto, {
  foreignKey: 'produto_id',
  as: 'saldos_estoque',
});

SaldoEstoqueProduto.belongsTo(Produto, {
  foreignKey: 'produto_id',
  as: 'produto',
});

Estoque.hasMany(SaldoEstoqueProduto, {
  foreignKey: 'estoque_id',
  as: 'saldos_produtos',
});

SaldoEstoqueProduto.belongsTo(Estoque, {
  foreignKey: 'estoque_id',
  as: 'estoque',
});

Usuario.hasMany(MovimentacaoEstoque, {
  foreignKey: 'usuario_id',
  as: 'movimentacoes_estoque',
});

MovimentacaoEstoque.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Produto.hasMany(MovimentacaoEstoque, {
  foreignKey: 'produto_id',
  as: 'movimentacoes_estoque',
});

MovimentacaoEstoque.belongsTo(Produto, {
  foreignKey: 'produto_id',
  as: 'produto',
});

Estoque.hasMany(MovimentacaoEstoque, {
  foreignKey: 'estoque_origem_id',
  as: 'movimentacoes_origem',
});

MovimentacaoEstoque.belongsTo(Estoque, {
  foreignKey: 'estoque_origem_id',
  as: 'estoque_origem',
});

Estoque.hasMany(MovimentacaoEstoque, {
  foreignKey: 'estoque_destino_id',
  as: 'movimentacoes_destino',
});

MovimentacaoEstoque.belongsTo(Estoque, {
  foreignKey: 'estoque_destino_id',
  as: 'estoque_destino',
});

Usuario.hasMany(Caixa, {
  foreignKey: 'usuario_id',
  as: 'caixas',
});

Caixa.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Pdv.hasMany(Caixa, {
  foreignKey: 'pdv_id',
  as: 'caixas',
});

Caixa.belongsTo(Pdv, {
  foreignKey: 'pdv_id',
  as: 'pdv',
});

Usuario.hasMany(Venda, {
  foreignKey: 'usuario_id',
  as: 'vendas',
});

Venda.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Pdv.hasMany(Venda, {
  foreignKey: 'pdv_id',
  as: 'vendas',
});

Venda.belongsTo(Pdv, {
  foreignKey: 'pdv_id',
  as: 'pdv',
});

Caixa.hasMany(Venda, {
  foreignKey: 'caixa_id',
  as: 'vendas',
});

Venda.belongsTo(Caixa, {
  foreignKey: 'caixa_id',
  as: 'caixa',
});

Caixa.hasMany(Venda, {
  foreignKey: 'caixa_recebimento_id',
  as: 'recebimentos',
});

Venda.belongsTo(Caixa, {
  foreignKey: 'caixa_recebimento_id',
  as: 'caixa_recebimento',
});

Usuario.hasMany(Nf, {
  foreignKey: 'usuario_id',
  as: 'notas_fiscais',
});

Nf.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Venda.hasMany(Nf, {
  foreignKey: 'venda_id',
  as: 'notas_fiscais',
});

Nf.belongsTo(Venda, {
  foreignKey: 'venda_id',
  as: 'venda',
});

Pdv.hasMany(Nf, {
  foreignKey: 'pdv_id',
  as: 'notas_fiscais',
});

Nf.belongsTo(Pdv, {
  foreignKey: 'pdv_id',
  as: 'pdv',
});

Caixa.hasMany(Nf, {
  foreignKey: 'caixa_id',
  as: 'notas_fiscais',
});

Nf.belongsTo(Caixa, {
  foreignKey: 'caixa_id',
  as: 'caixa',
});

Arquivo.hasMany(Nf, {
  foreignKey: 'xml_enviado_arquivo_id',
  as: 'notas_xml_enviado',
});

Nf.belongsTo(Arquivo, {
  foreignKey: 'xml_enviado_arquivo_id',
  as: 'xml_enviado',
});

Arquivo.hasMany(Nf, {
  foreignKey: 'xml_autorizado_arquivo_id',
  as: 'notas_xml_autorizado',
});

Nf.belongsTo(Arquivo, {
  foreignKey: 'xml_autorizado_arquivo_id',
  as: 'xml_autorizado',
});

Arquivo.hasMany(Nf, {
  foreignKey: 'danfe_pdf_arquivo_id',
  as: 'notas_danfe_pdf',
});

Nf.belongsTo(Arquivo, {
  foreignKey: 'danfe_pdf_arquivo_id',
  as: 'danfe_pdf',
});

Nf.hasMany(NfEvento, {
  foreignKey: 'nf_id',
  as: 'historico',
});

NfEvento.belongsTo(Nf, {
  foreignKey: 'nf_id',
  as: 'nota_fiscal',
});

Usuario.hasMany(NfEvento, {
  foreignKey: 'usuario_id',
  as: 'eventos_notas_fiscais',
});

NfEvento.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Arquivo.hasMany(NfEvento, {
  foreignKey: 'arquivo_xml_id',
  as: 'eventos_notas_xml',
});

NfEvento.belongsTo(Arquivo, {
  foreignKey: 'arquivo_xml_id',
  as: 'arquivo_xml',
});

Usuario.hasMany(ClienteConvenio, {
  foreignKey: 'usuario_id',
  as: 'clientes_convenio',
});

ClienteConvenio.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Usuario.hasMany(Funcionario, {
  foreignKey: 'usuario_id',
  as: 'funcionarios',
});

Funcionario.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

ClienteConvenio.hasMany(Venda, {
  foreignKey: 'cliente_convenio_id',
  as: 'vendas',
});

Venda.belongsTo(ClienteConvenio, {
  foreignKey: 'cliente_convenio_id',
  as: 'cliente_convenio',
});

Usuario.hasMany(DespesaCaixa, {
  foreignKey: 'usuario_id',
  as: 'despesas_caixa',
});

DespesaCaixa.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Pdv.hasMany(DespesaCaixa, {
  foreignKey: 'pdv_id',
  as: 'despesas',
});

DespesaCaixa.belongsTo(Pdv, {
  foreignKey: 'pdv_id',
  as: 'pdv',
});

Caixa.hasMany(DespesaCaixa, {
  foreignKey: 'caixa_id',
  as: 'despesas',
});

DespesaCaixa.belongsTo(Caixa, {
  foreignKey: 'caixa_id',
  as: 'caixa',
});

Usuario.hasMany(ConferenciaCaixa, {
  foreignKey: 'usuario_id',
  as: 'conferencias_caixa',
});

ConferenciaCaixa.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Caixa.hasOne(ConferenciaCaixa, {
  foreignKey: 'caixa_id',
  as: 'conferencia',
});

ConferenciaCaixa.belongsTo(Caixa, {
  foreignKey: 'caixa_id',
  as: 'caixa',
});

Usuario.hasMany(EventoPdv, {
  foreignKey: 'usuario_id',
  as: 'eventos_pdv',
});

EventoPdv.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

Pdv.hasMany(EventoPdv, {
  foreignKey: 'pdv_id',
  as: 'eventos',
});

EventoPdv.belongsTo(Pdv, {
  foreignKey: 'pdv_id',
  as: 'pdv',
});

Usuario.hasOne(ConfiguracaoSistema, {
  foreignKey: 'usuario_id',
  as: 'configuracao_sistema',
});

ConfiguracaoSistema.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});

module.exports = {
  Arquivo,
  Assinatura,
  Caixa,
  CategoriaProduto,
  ClienteConvenio,
  ConfiguracaoSistema,
  ConferenciaCaixa,
  DespesaCaixa,
  Estoque,
  EventoPdv,
  Funcionario,
  GrupoFiscal,
  MovimentacaoEstoque,
  Nf,
  NfEvento,
  PagamentoAssinatura,
  Pdv,
  Produto,
  SaldoEstoqueProduto,
  Subconta,
  Usuario,
  Venda,
};
