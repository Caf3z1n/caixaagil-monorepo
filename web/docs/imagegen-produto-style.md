# Padrão de imagens da seção Produto

Use este padrão para gerar novas imagens da landing do Caixa Ágil.

## Direção visual

- Ilustração 3D premium, com aparência de animação de longa-metragem, formas arredondadas e materiais limpos.
- Assunto sempre ligado à operação de balcão: PDV, leitor de código de barras, impressora de cupom, estoque, fiscal, comércios e rotina local.
- Paleta com branco quente, off-white, grafite, neutros suaves e acentos no laranja do Caixa Ágil (`#ff5a00`).
- Sem logos de terceiros, sem marcas reais, sem textos legíveis e sem placas com palavras.
- Composição em objeto recortado, centralizado, com bastante respiro e sem cenário ao fundo.

## Prompt base

```text
Use case: stylized-concept
Asset type: landing page product section illustration for Caixa Ágil
Primary request: <descreva o assunto da imagem>
Subject: <objetos principais da cena>
Style/medium: premium stylized 3D animated feature look, soft rounded forms, clean materials, high-quality render matching existing Caixa Ágil product illustrations.
Composition/framing: centered object cluster, three-quarter isometric angle, generous padding, no background scene, no floor plane, no cast shadow outside the subject.
Lighting/mood: soft studio lighting on the subject only, friendly, reliable, commercial, premium but operational.
Color palette: off-white, warm neutrals, charcoal details, Caixa Ágil orange accents (#ff5a00). Avoid green in the subject.
Transparent workflow: render the subject on a perfectly flat solid #00ff00 chroma-key background for background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep the subject fully separated from the background with crisp edges and generous padding. Do not use #00ff00 anywhere in the subject.
Constraints: no logos, no brand names, no readable text, no watermark, no people, no signs with words, no background grid, no white rectangular canvas behind the subject.
```

## Remoção do fundo

Depois de gerar em chroma key, remova o fundo com:

```powershell
python "C:\Users\Pedro Henrique\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" --input <source.png> --out <final.png> --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```
