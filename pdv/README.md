# Caixa Agil PDV

App desktop do Caixa Agil para o computador do caixa.

## Comandos

```powershell
npm install --prefix pdv
npm run dev:pdv
npm run typecheck:pdv
npm run build:pdv
```

Em desenvolvimento, o Next roda em `http://localhost:3030` e o Electron abre essa URL.
No build, o Next exporta arquivos estaticos para `pdv/out` e o Electron carrega `out/index.html`.
