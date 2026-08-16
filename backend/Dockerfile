# Backend ficticio da LumenShop. Laboratorio local — nao exponha na internet.
# node:20-slim tem as ferramentas de build que o better-sqlite3 precisa quando
# nao ha binario pronto para a plataforma, sem o malabarismo do alpine.
FROM node:20-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------

FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    MODE=vulnerable \
    PORT=3000 \
    DB_PATH=/app/data/lumenshop.sqlite

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY README.md ./

# O banco e recriado a partir da semente sempre que o arquivo nao existe.
# /data existe no image (e pertence ao usuario node) porque o docker-compose
# monta um volume nomeado ali: volume vazio herda o dono do diretorio da imagem.
# Sem isso o volume nasce do root e o processo nao consegue abrir o sqlite.
RUN mkdir -p /app/data /data && chown -R node:node /app /data

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
