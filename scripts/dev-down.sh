#!/usr/bin/env bash
# =====================================================================
# LumenShop — derruba o laboratório.
#
#   ./scripts/dev-down.sh            (ou:  npm run dev:down)
#   ./scripts/dev-down.sh --volumes  apaga também os volumes (banco + n8n)
#
# Sem --volumes, os dados do n8n (workflows importados, credenciais) e os
# bancos fictícios sobrevivem, e o próximo ./scripts/dev.sh sobe mais rápido.
# =====================================================================
set -uo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" = "--volumes" ] || [ "${1:-}" = "-v" ]; then
  echo "▸ Derrubando tudo e APAGANDO os volumes (banco fictício + dados do n8n)…"
  docker compose down -v
else
  echo "▸ Derrubando os containers (os volumes ficam)…"
  echo "  Para apagar também os volumes:  ./scripts/dev-down.sh --volumes"
  docker compose down
fi

echo "✓ Laboratório derrubado."
