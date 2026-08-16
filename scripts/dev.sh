#!/usr/bin/env bash
# =====================================================================
# LumenShop — o laboratório inteiro em UM comando.
#
#   ./scripts/dev.sh          (ou:  npm run dev)
#
# Sobe n8n + os dois backends + o mock da WhatsApp Cloud API com a UI de
# conversa, espera tudo ficar de pé, IMPORTA e ATIVA os dois workflows, e
# imprime as URLs prontas. Sem conta na Meta, sem token, sem chave de modelo.
#
# LOJA FICTÍCIA. DADOS INVENTADOS. LOCALHOST. Não exponha na internet.
#
# É idempotente: rodar de novo não duplica os workflows (eles têm id fixo).
# =====================================================================
set -uo pipefail

cd "$(dirname "$0")/.."

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  CYAN=$'\033[36m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; CYAN=""; RED=""; RESET=""
fi

PORT_N8N="${PORT_N8N:-5678}"
PORT_VULNERAVEL="${PORT_VULNERAVEL:-3000}"
PORT_BLINDADO="${PORT_BLINDADO:-3001}"
PORT_MOCK="${PORT_MOCK:-8080}"

msg() { echo "${CYAN}▸${RESET} $*"; }
ok()  { echo "${GREEN}✓${RESET} $*"; }
warn(){ echo "${YELLOW}!${RESET} $*"; }

# espera <url> <nome> <tentativas>
espera() {
  local url="$1" nome="$2" tentativas="${3:-60}"
  printf '%s' "  aguardando ${nome}…"
  for _ in $(seq 1 "$tentativas"); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      printf ' %spronto%s\n' "$GREEN" "$RESET"
      return 0
    fi
    printf '.'
    sleep 2
  done
  echo " ${RED}não respondeu${RESET}"
  return 1
}

echo
echo "${BOLD}LumenShop — laboratório do episódio 003 (Joe Ships)${RESET}"
echo "${YELLOW}Loja fictícia. Dados inventados. Tudo em localhost.${RESET}"
echo

if [ ! -f .env ]; then
  cp .env.example .env
  ok ".env criado a partir do .env.example (só placeholders — nada de segredo)"
fi

msg "Subindo os containers (docker compose up -d --build)…"
if ! docker compose up -d --build; then
  echo "${RED}Falha ao subir o compose.${RESET} O Docker está rodando?"
  exit 1
fi

echo
msg "Esperando os serviços ficarem de pé…"
espera "http://localhost:${PORT_VULNERAVEL}/health" "backend vulnerável" || true
espera "http://localhost:${PORT_BLINDADO}/health"  "backend blindado"   || true
espera "http://localhost:${PORT_MOCK}/health"      "mock do WhatsApp"    || true
espera "http://localhost:${PORT_N8N}/healthz"      "n8n"                 60 || {
  echo "${RED}O n8n não subiu a tempo.${RESET} Veja:  docker compose logs n8n"
  exit 1
}

echo
msg "Importando os dois workflows no n8n (idempotente, id fixo)…"
docker compose exec -T n8n n8n import:workflow --input=/workflows/lumenshop-vulnerable.json >/dev/null 2>&1 \
  && ok "workflow VULNERÁVEL importado" || warn "não consegui importar o vulnerável (veja: docker compose logs n8n)"
docker compose exec -T n8n n8n import:workflow --input=/workflows/lumenshop-hardened.json >/dev/null 2>&1 \
  && ok "workflow BLINDADO importado"  || warn "não consegui importar o blindado"

msg "Ativando os workflows (a URL de produção /webhook/ só existe com o workflow ativo)…"
ATIVOU=1
docker compose exec -T n8n n8n update:workflow --id=LumenShopVuln001 --active=true >/dev/null 2>&1 || ATIVOU=0
docker compose exec -T n8n n8n update:workflow --id=LumenShopHard001 --active=true >/dev/null 2>&1 || ATIVOU=0
if [ "$ATIVOU" = "1" ]; then
  ok "os dois workflows ficaram ativos"
  # O n8n registra os webhooks de produção no boot. Reiniciar garante que
  # /webhook/lumenshop-vulneravel e /webhook/lumenshop-blindado respondam já.
  msg "Reiniciando o n8n para registrar os webhooks…"
  docker compose restart n8n >/dev/null 2>&1 || true
  espera "http://localhost:${PORT_N8N}/healthz" "n8n" 60 || true
else
  warn "não consegui ativar pela CLI. Abra ${CYAN}http://localhost:${PORT_N8N}${RESET} e ligue o botão ${BOLD}Active${RESET} nos dois workflows."
fi

# Base limpa e o ataque 4 rearmado, para o demo começar do zero.
for base in "http://localhost:${PORT_VULNERAVEL}" "http://localhost:${PORT_BLINDADO}"; do
  curl -sf -X POST "${base}/admin/reset" >/dev/null 2>&1 || true
  curl -sf -X POST "${base}/admin/envenenar" >/dev/null 2>&1 || true
done
curl -sf -X POST "http://localhost:${PORT_MOCK}/__mock/reset" >/dev/null 2>&1 || true

echo
echo "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${RESET}"
echo "${BOLD}${GREEN} Laboratório de pé. Sem Meta, sem token, sem chave de modelo.${RESET}"
echo "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${RESET}"
echo
echo "  ${BOLD}Conversa (estilo WhatsApp)${RESET}   http://localhost:${PORT_MOCK}"
echo "  ${BOLD}Editor do n8n${RESET}               http://localhost:${PORT_N8N}"
echo "  ${BOLD}Banco fictício${RESET}              http://localhost:${PORT_VULNERAVEL}/admin/db"
echo "  ${BOLD}Logs${RESET}                        http://localhost:${PORT_VULNERAVEL}/admin/logs?html=1"
echo "  ${BOLD}Gastos (razão simulado)${RESET}     http://localhost:${PORT_BLINDADO}/admin/gastos"
echo "  ${DIM}backend vulnerável  http://localhost:${PORT_VULNERAVEL}${RESET}"
echo "  ${DIM}backend blindado    http://localhost:${PORT_BLINDADO}${RESET}"
echo
echo "  ${BOLD}Experimente:${RESET} abra a conversa e mande ${CYAN}cadê meu pedido${RESET}"
echo "  ${DIM}Os seis ataques nos dois modos, com placar:  ./scripts/run-attacks.sh${RESET}"
echo "  ${DIM}Derrubar tudo:  ./scripts/dev-down.sh${RESET}"
echo
