# Mock da WhatsApp Cloud API + UI de conversa. Laboratorio local — nao exponha
# na internet. So depende do express, entao a imagem e minima.
FROM node:20-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

USER node

EXPOSE 8080

CMD ["node", "src/server.js"]
