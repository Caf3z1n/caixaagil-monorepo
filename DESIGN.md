---
name: Caixa Ágil
description: Sistema operacional minimalista para gestão web e PDV desktop.
colors:
  primary: "#ff6302"
  primary-strong: "#e75600"
  primary-deep: "#9b3100"
  paper: "#fcfaf7"
  surface: "#fffdfa"
  surface-muted: "#f4f1ed"
  ink: "#111827"
  ink-muted: "#606874"
  line: "#ded9d2"
  success: "#15a46b"
  danger: "#d93b3b"
typography:
  display:
    fontFamily: "Segoe UI, Roboto, Arial, sans-serif"
    fontWeight: 950
    lineHeight: 1
    letterSpacing: "0"
  body:
    fontFamily: "Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "46px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "46px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "50px"
  modal-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
---

# Design System: Caixa Ágil

## 1. Overview

**Creative North Star: "Operação Limpa"**

Caixa Ágil deve parecer um software de operação que já sabe o que o usuário precisa fazer. A tela não deve tentar impressionar com excesso de elementos. Ela deve reduzir decisões, mostrar a ação principal e deixar o fluxo caminhar com naturalidade.

As referências internas principais são os modais do botão "Entrar" da landing, a hero, a página `/` da web e as telas de onboarding do projeto web. Essas superfícies definem o padrão: fundo limpo, tipografia forte quando existe uma etapa clara, poucos controles por vez, botões grandes e ação primária evidente.

O sistema rejeita dashboard genérico de IA, excesso de cards, excesso de gradiente, telas poluídas com muitas informações e excesso de texto. Telas administrativas devem ser objetivas. Quando uma lista precisa criar ou editar itens, prefira abrir um modal ou fluxo focado em vez de misturar formulário, lista e muitos painéis na mesma viewport.

**Key Characteristics:**
- Minimalista, rápido e operacional.
- Uma ação principal clara por etapa.
- Fluxos progressivos para cadastro, ativação e configuração.
- Listas limpas, com detalhes secundários sob demanda.
- Visual premium sem decoração gratuita.

## 2. Colors

A paleta é clara, quente e operacional: neutros discretos sustentam a maior parte da interface, enquanto o laranja Caixa Ágil aparece em ações primárias, progresso e estados de destaque.

### Primary
- **Laranja Caixa Ágil**: cor principal da marca. Use em botões primários, progresso ativo, estados de onboarding e ações que avançam o fluxo.
- **Laranja Forte**: variação para hover, ênfase pontual e contraste em superfícies claras.
- **Laranja Profundo**: use apenas em fundos densos, overlays ou contraste de suporte. Não transforme a interface em uma paleta marrom.

### Secondary
- **Verde de Confirmação**: use somente para sucesso real, como e-mail confirmado, código copiado, PDV ativado ou operação concluída.
- **Vermelho de Bloqueio**: use para erro que impede avanço. Evite usar vermelho para avisos leves.

### Neutral
- **Papel Quente**: base da página pública e fundos externos.
- **Superfície Limpa**: cards, modais, inputs e áreas de trabalho.
- **Superfície Baixa**: divisores de seção e pequenos estados neutros.
- **Tinta Operacional**: texto principal, títulos e dados importantes.
- **Texto Muted**: descrições curtas e metadados.
- **Linha Suave**: bordas de inputs, cards e separadores.

### Named Rules

**The One Accent Rule.** Laranja é ação e progresso, não decoração. Se mais de uma área da tela grita em laranja, a tela está errada.

**The No Gradient Noise Rule.** Gradientes fortes só podem existir em superfícies de marca ou onboarding quando forem parte do foco da tela. Em dashboard, formulário e lista, use cor sólida e contraste limpo.

## 3. Typography

**Display Font:** Segoe UI, Roboto, Arial, sans-serif
**Body Font:** Segoe UI, Roboto, Arial, sans-serif
**Label/Mono Font:** mesma família do corpo, com peso maior para labels.

**Character:** A tipografia deve ser direta e pesada apenas quando orienta uma etapa. Títulos grandes funcionam em login, reset, verificação, hero e onboarding. Dentro de dashboard, lista, formulário e card compacto, use hierarquia menor e mais operacional.

### Hierarchy
- **Display** (950, line-height 1): use em etapas de fluxo, landing e onboarding. Não use em painéis densos.
- **Headline** (850-900, 1.6rem-2.2rem): use em modais, páginas focadas e cabeçalhos de plataforma.
- **Title** (800-900, 1rem-1.25rem): use em seções, listas e blocos de trabalho.
- **Body** (500-650, 0.92rem-1rem, line-height 1.45-1.55): use para descrições curtas, com limite de leitura. Texto longo dentro da interface é um alerta de design.
- **Label** (820-900, 0.78rem-0.9rem, letter-spacing 0): use em campos, ações, status e navegação.

### Named Rules

**The Short Text Rule.** A interface deve dizer pouco e dizer bem. Se um texto explica como usar uma tela, provavelmente o fluxo está mal desenhado.

## 4. Elevation

Caixa Ágil usa elevação mínima. Profundidade existe para separar modais, onboarding e superfícies importantes, não para transformar cada bloco em um card flutuante. Em telas operacionais, prefira bordas suaves, espaços bem definidos e agrupamento por layout.

### Shadow Vocabulary
- **Modal Focus** (`0 30px 78px -42px` com tinta escura translúcida): use em modais e cards centrais de fluxo.
- **Onboarding Shell** (`0 34px 90px -42px` com tinta escura translúcida): use em telas de configuração inicial e páginas de estado.
- **Button Inset** (`inset 0 1px 0` com branco translúcido): use nos botões primários para dar acabamento sem sombra externa pesada.

### Named Rules

**The Flat Work Rule.** Telas de trabalho são planas por padrão. Sombras aparecem em modais, overlays e estados focados, não em todos os blocos.

## 5. Components

### Buttons
- **Shape:** cantos contidos e profissionais (8px).
- **Primary:** fundo laranja, texto claro, altura mínima de 42-46px, ícone alinhado ao texto, sem sombra externa pesada.
- **Hover / Focus:** mudança sutil, sem animação chamativa. Foco deve ser visível e consistente.
- **Secondary:** fundo claro, borda suave e texto laranja. Use para voltar, cancelar e ações alternativas.
- **Save / Confirm:** em modais de cadastro ou edição de itens, botões de salvar/cadastrar usam verde de confirmação com texto branco. O laranja fica reservado para avançar fluxo, criar a partir de listas e navegação principal.
- **Icon buttons:** use lucide quando existir ícone adequado. Ícone deve ser familiar e alinhado, não desenhado manualmente sem necessidade.

### Chips
- **Style:** pequenos, discretos e funcionais. Use para status e filtros, não para decorar frases.
- **State:** estado ativo deve ser claro por cor, peso ou borda, sem saturar a tela.

### Cards / Containers
- **Corner Style:** 8px em cards repetidos e painéis operacionais; 18px apenas em modais e fluxos centrais já estabelecidos.
- **Background:** superfície limpa, sem gradiente decorativo.
- **Shadow Strategy:** seguir a regra de elevação. Cards comuns usam borda, não sombra pesada.
- **Internal Padding:** compacto e proporcional. Evite espaços vazios grandes em telas de trabalho.

### Inputs / Fields
- **Style:** altura de 50px em fluxos e modais; borda suave; fundo claro; texto forte o suficiente para leitura rápida.
- **Focus:** borda laranja e anel suave.
- **Error / Disabled:** erro deve ser claro, mas não ocupar a tela inteira. Texto curto, sem título quando o contexto já é evidente.

### Navigation

Navegação deve ser previsível e silenciosa. O usuário deve encontrar o caminho sem competir com a tarefa principal. Em áreas logadas, evite excesso de atalhos, badges, cards de resumo e blocos promocionais juntos.

### Modals and Progressive Flows

Modais e fluxos progressivos são padrões preferenciais para criar, editar, ativar, contratar, verificar e configurar. O modal do botão "Entrar" e o onboarding web são referências internas. Cada etapa deve ter título forte, descrição curta, poucos campos e ações primária/secundária claras.

Em modais de cadastro/edição de itens, a barra de ações deve ser consistente: `Cancelar` fica à esquerda; à direita ficam as ações do registro, com `Excluir` antes de `Salvar/Cadastrar` quando houver exclusão. Salvar/cadastrar usa verde com texto branco; excluir usa vermelho; cancelar usa botão secundário claro.

### Lists

Listas devem ser limpas e escaneáveis. Uma lista pode ter ação de adicionar, busca/filtro e estado vazio, mas não deve carregar formulário completo junto da listagem. Criação e edição devem abrir modal ou painel focado quando isso reduzir ruído.

### Motion

Animações fazem parte do padrão da plataforma web. Use transições suaves em navegação entre páginas logadas, troca de etapas, abertura de modais e entrada de itens em listas/cards. O movimento deve durar em geral entre 150ms e 520ms, comunicar continuidade de fluxo e nunca bloquear a operação.

### Loading Skeletons

Quando uma superfície depende de dados da API, use skeletons com o formato aproximado do conteúdo final. Prefira linhas e blocos neutros no lugar de spinners soltos sempre que houver estrutura previsível, como cards de conta, listas de PDVs, listas fiscais, tabelas e painéis.

## 6. Do's and Don'ts

### Do:
- **Do** usar os modais do botão "Entrar", a hero, a página `/` e o onboarding web como referência visual principal.
- **Do** manter uma ação primária clara por etapa.
- **Do** preferir modais ou fluxos progressivos para cadastro e edição quando uma tela ficaria poluída.
- **Do** usar laranja para ação, progresso e seleção ativa.
- **Do** escrever textos curtos em pt-BR com acentuação correta e arquivos em UTF-8.
- **Do** criar estados completos: vazio, loading, erro, sucesso, hover, foco e disabled.
- **Do** usar animações suaves para deixar fluxos progressivos e navegação da plataforma mais contínuos.
- **Do** usar skeletons em carregamentos de conteúdo estrutural vindo da API.

### Don't:
- **Don't** criar dashboard genérico de IA.
- **Don't** usar excesso de cards, excesso de gradiente ou excesso de texto.
- **Don't** misturar lista e formulário grande na mesma superfície quando um modal resolve melhor.
- **Don't** reproduzir o visual poluído das telas `/home...` atuais.
- **Don't** criar interface institucional genérica para fluxos operacionais.
- **Don't** usar decoração que não ajuda o usuário a concluir a próxima ação.
