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

## HTTPS com Tailscale
A forma mais simples aqui é expor o Kenku por HTTPS via **Tailscale Serve** usando um pequeno proxy local que adiciona CORS.

### 1) Suba o proxy local
```bash
npm run proxy:kenku
```

### 2) Exponha via Tailscale
Em outro terminal:
```bash
/home/deck/.local/bin/tailscale --socket=/home/deck/.tailscale/tailscaled.sock serve --bg 8787
```

### Como serviço de usuário
Os unit files ficam em `systemd/user/` e podem ser instalados em:
```bash
cp systemd/user/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now kenku-proxy.service tailscale-serve.service
```

### 3) Use no Tengu
```text
https://steamdeck.taile7381b.ts.net/v1
```

Se quiser trocar o origin permitido, use `ALLOW_ORIGIN` no proxy.

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
