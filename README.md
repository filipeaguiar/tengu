# Tengu

PWA instalável para controlar o **Kenku FM Remote**.

Configurado para publicar em `https://filipeaguiar.github.io/tengu/`.

## Recursos
- configurar o endereço do servidor
- listar playlists e soundboards
- reproduzir, pausar, avançar e voltar
- ajustar volume da playlist
- criar cenas locais que disparam playlist + sons
- instalável no Android
- deploy automático no GitHub Pages via Actions

## Limitação importante
O GitHub Pages roda em **HTTPS**. Se o Kenku Remote estiver em **HTTP** na rede local, o navegador pode bloquear as chamadas por mixed content/CORS.

Para funcionar bem, use:
- um endereço HTTPS para o Kenku Remote, ou
- um proxy/reverse proxy seguro apontando para o Kenku.

## Desenvolvimento
```bash
npm install
npm run generate:icons
npm run dev
```

## Build
```bash
npm run build
```

## Deploy
O workflow está em `.github/workflows/deploy.yml`.
