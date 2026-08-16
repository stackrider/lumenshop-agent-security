# SETUP — como rodar o laboratório

> **A LumenShop não existe.** Loja fictícia, pedidos falsos, clientes falsos,
> telefones falsos. Nada aqui toca sistema de terceiros. Rode só na sua
> máquina, contra o seu próprio laboratório.

Tem dois caminhos. O primeiro não precisa de WhatsApp, não precisa de conta na
Meta e não gasta um centavo. Comece por ele.

---

## Caminho 1 — laboratório local (5 minutos, sem WhatsApp, sem modelo)

Aqui você ataca o **backend** direto, no curl. É onde as falhas de verdade
moram: autorização, identidade, cupom, limite. O modelo só é o mensageiro.

### 1.1 Requisitos

- Docker + Docker Compose (ou Node 20+, se preferir sem Docker)
- `curl` e, opcionalmente, `jq` para ler o JSON bonito

### 1.2 Subir

```bash
git clone https://github.com/stackrider/lumenshop-agent-security.git
cd lumenshop-agent-security
cp .env.example .env          # placeholders; não tem segredo nenhum aqui
docker compose up -d --build
```

Sobem três containers:

| Container | O que é | URL |
| --- | --- | --- |
| `lumenshop-backend-vulneravel` | A loja fictícia do jeito ingênuo | <http://localhost:3000> |
| `lumenshop-backend-blindado` | A mesma loja, blindada | <http://localhost:3001> |
| `lumenshop-n8n` | O n8n | <http://localhost:5678> |

Confira:

```bash
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3001/health | jq
open http://localhost:3000/admin/db     # a base fictícia, em tela cheia
```

### 1.3 Rodar os seis ataques nos dois modos

```bash
./scripts/run-attacks.sh
```

O script bate nas mesmas rotas nos dois backends e imprime o placar do §23:
seis funcionam no vulnerável, quatro morrem no blindado. Cada ataque, o que
foi enviado e o que voltou está explicado em [ATTACKS.md](ATTACKS.md).

### 1.4 Sem Docker

```bash
cd backend
npm install
MODE=vulnerable PORT=3000 npm start     # num terminal
MODE=hardened  PORT=3001 npm start      # em outro
```

---

## Caminho 2 — o agente inteiro no n8n

Agora com modelo de verdade. Continua sem WhatsApp: dá pra conversar com o
agente batendo no webhook com `curl`.

### 2.1 Importar os workflows

1. Abra <http://localhost:5678> e crie a conta local do n8n (é só sua, fica no
   volume do Docker).
2. **Workflows → ⋯ → Import from File** e importe:
   - `workflows/lumenshop-vulnerable.json`
   - `workflows/lumenshop-hardened.json`
   (os arquivos também estão montados dentro do container em `/workflows`)

### 2.2 Cadastrar a credencial do modelo

Os dois workflows têm um nó **Modelo** com a credencial marcada como
`SUBSTITUA_PELA_SUA_CREDENCIAL`. Isso é de propósito: **nenhuma chave é
versionada neste repositório**.

1. **Credentials → New → OpenAI**, cole a sua chave (ou troque o nó por
   Anthropic, Ollama, Groq, o que você usar — é um sub-nó de modelo, troca sem
   mexer no resto).
2. Abra o nó **Modelo** em cada workflow e selecione a credencial que você
   acabou de criar.
3. Salve.

Rodar o agente **gasta** dinheiro no seu provedor. É pouco (`gpt-4o-mini` faz
esse laboratório inteiro por centavos), mas é dinheiro real. O ataque 6 existe
justamente para mostrar isso.

### 2.3 Conversar com o agente sem WhatsApp

Ative o workflow (ou clique em **Execute workflow** para usar a URL de teste) e:

```bash
# caminho feliz, versão vulnerável
curl -s -X POST http://localhost:5678/webhook/lumenshop-vulneravel \
  -H 'content-type: application/json' \
  -d '{"telefone":"+5511999990001","nome":"Joe","mensagem":"hey cadê meu pedido?"}' | jq

# a mesma coisa, versão blindada
curl -s -X POST http://localhost:5678/webhook/lumenshop-blindado \
  -H 'content-type: application/json' \
  -d '{"telefone":"+5511999990001","nome":"Joe","mensagem":"hey cadê meu pedido?"}' | jq
```

Os dois nós **Extrair Mensagem do WhatsApp** aceitam tanto esse JSON simples
quanto o payload real da WhatsApp Cloud API. É o mesmo código nos dois
workflows — a diferença começa no nó seguinte.

> Se você usa a URL de teste do n8n (`/webhook-test/...` em vez de
> `/webhook/...`), lembre de clicar em **Execute workflow** antes de cada
> requisição.

### 2.4 Suposições de versão do n8n

Os workflows foram escritos no esquema de nós desta linha:

| Nó | Tipo | typeVersion |
| --- | --- | --- |
| Webhook | `n8n-nodes-base.webhook` | 2 |
| Code | `n8n-nodes-base.code` | 2 |
| If | `n8n-nodes-base.if` | 2.2 |
| HTTP Request | `n8n-nodes-base.httpRequest` | 4.2 |
| Respond to Webhook | `n8n-nodes-base.respondToWebhook` | 1.1 |
| AI Agent | `@n8n/n8n-nodes-langchain.agent` | 1.7 |
| Modelo de chat | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | 1.2 |
| Memória | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | 1.3 |
| Ferramenta HTTP | `@n8n/n8n-nodes-langchain.toolHttpRequest` | 1.1 |

Se a sua versão do n8n for mais nova, a importação migra os nós sozinha e
pode redesenhar algum campo. Se algum nó abrir com aviso de parâmetro
desconhecido, abra, confira os campos contra a tabela acima e salve — o
desenho do fluxo (quem liga em quem) é o que importa e não muda.

O nó de código do workflow blindado lê `$env.LIMIT_BODY_CHARS`. Para isso o
compose sobe o n8n com `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Em produção de
verdade você deixaria isso bloqueado e passaria o limite por outro caminho —
aqui é laboratório e é melhor mostrar o limite escrito na cara.

---

## Caminho 3 — no WhatsApp de verdade

Isto exige uma conta na Meta e **um número de teste**. Nunca aponte este
laboratório para o número real da sua empresa: ele executa cancelamento e
desconto em cima de dados de brincadeira, e no modo vulnerável ele obedece
qualquer um.

### 3.1 O que você precisa da Meta

Siga a documentação oficial — ela muda de tela com frequência, então não vou
copiar screenshot aqui:

- WhatsApp Cloud API — visão geral:
  <https://developers.facebook.com/docs/whatsapp/cloud-api>
- Primeiros passos e número de teste:
  <https://developers.facebook.com/docs/whatsapp/cloud-api/get-started>
- Webhooks:
  <https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks>

O resumo do §7 do roteiro: WhatsApp Business, número de teste, API oficial da
Meta, um webhook no n8n recebendo a mensagem e o n8n devolvendo a resposta pelo
mesmo canal. É encanamento. E encanamento é onde metade dos problemas mora.

Você vai sair de lá com três coisas:

1. **Token de acesso** (o temporário de 24h serve para gravar um vídeo)
2. **Phone number ID** do número de teste
3. **Verify token** — uma frase que você inventa e repete nos dois lados

Coloque no seu `.env` local:

```bash
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
```

**Nunca commite o `.env`.** Ele está no `.gitignore`. Se um token vazar,
revogue no painel da Meta antes de qualquer outra coisa.

### 3.2 Expor o webhook

A Meta precisa alcançar o seu n8n por HTTPS. No laboratório, um túnel resolve:

```bash
# escolha um: cloudflared, ngrok, tailscale funnel...
cloudflared tunnel --url http://localhost:5678
```

Pegue a URL `https://...` que o túnel te deu e configure na Meta:

- **Callback URL**: `https://SEU-TUNEL/webhook/lumenshop-vulneravel`
- **Verify token**: o mesmo do seu `.env`
- Assine o campo **messages**

> O n8n responde a verificação `GET` do webhook com o parâmetro
> `hub.challenge`. Se a Meta reclamar, confira que o workflow está **ativo**
> (URL de produção, `/webhook/`) e não em modo de teste.

### 3.3 Trocar o modo

Para gravar o antes e o depois é só trocar a URL do webhook na Meta entre
`/webhook/lumenshop-vulneravel` e `/webhook/lumenshop-blindado`. Os dois
backends já estão de pé, cada workflow fala com o seu.

---

## Antes de gravar

Do próprio roteiro, e vale para qualquer um:

- Feche e-mail, chats, gerenciador de senhas, `.env`, tokens e qualquer painel
  real. Só a base fictícia da LumenShop aparece em tela.
- Use um perfil de navegador limpo.
- Se o token da Meta aparecer em tela por acidente, revogue depois. Não é
  vergonha, é procedimento.

## Limpar tudo

```bash
docker compose down -v      # apaga os volumes: bancos e dados do n8n
```
