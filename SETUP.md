# SETUP — como rodar o laboratório

> **A LumenShop não existe.** Loja fictícia, pedidos falsos, clientes falsos,
> telefones falsos. Nada aqui toca sistema de terceiros. Rode só na sua
> máquina, contra o seu próprio laboratório.

Tem alguns caminhos, do mais fácil ao mais completo. O **Caminho 0** sobe tudo
em um comando e não precisa de WhatsApp, de conta na Meta nem de chave de
modelo. Comece por ele.

---

## Caminho 0 — um comando (o mais fácil)

```bash
./scripts/dev.sh          # ou:  npm run dev
```

Isso sobe **quatro** coisas de uma vez, espera todas ficarem de pé, **importa
e ativa** os dois workflows no n8n, e imprime as URLs prontas:

| Container | O que é | URL |
| --- | --- | --- |
| `lumenshop-n8n` | o agente, nos dois workflows | <http://localhost:5678> |
| `lumenshop-backend-vulneravel` | a loja fictícia do jeito ingênuo | <http://localhost:3000> |
| `lumenshop-backend-blindado` | a mesma loja, blindada | <http://localhost:3001> |
| `lumenshop-whatsapp-mock` | o mock da WhatsApp Cloud API + a tela de conversa | <http://localhost:8080> |

Abra <http://localhost:8080>, escolha o modo (vulnerável/blindado), e mande
**"cadê meu pedido"**. Os botões de atalho mandam a mensagem exata de cada
ataque do [ATTACKS.md](ATTACKS.md).

Derrubar tudo: `./scripts/dev-down.sh` (ou `npm run dev:down`). Para apagar
também os volumes: `./scripts/dev-down.sh --volumes`.

O `dev.sh` é **idempotente**: rodar de novo não duplica os workflows (eles têm
id fixo, e o `n8n import:workflow` atualiza pelo id).

### A arquitetura do mock

A tarefa pedia "WireMock ou qualquer outra tecnologia de mock". A superfície da
API da Meta que o workflow usa é pequena, mas **três partes têm estado**: cada
envio precisa ser guardado, a tela de conversa é servida e faz *polling* desse
histórico, e a tela injeta a mensagem de entrada no webhook do n8n. Isso
exigiria o WireMock **mais** um serviço companheiro de qualquer jeito — então
o mock é um **Express de ~150 linhas** (`whatsapp-mock/`), na mesma stack Node
do backend, sem dependência extra. Ele mocka exatamente o que o n8n usa:

| Rota do mock | Papel na API da Meta |
| --- | --- |
| `POST /{versão}/{phone_number_id}/messages` | o endpoint de **envio** que o nó "Enviar Resposta no WhatsApp" chama. Devolve o envelope 200 no formato da Meta e **guarda o texto** para a tela mostrar. |
| `GET /webhook?hub.challenge=…` | o **handshake de verificação** do webhook (devolve o `hub.challenge` se o `verify_token` bater). |
| `POST /__mock/inbound` | a tela chama isto quando o "cliente" digita: monta o payload no formato da Meta e faz POST no webhook de produção do n8n. |
| `GET /__mock/messages` | *polling* da tela: as bolhas daquela conversa. |

> Se você preferir WireMock, dá para estubar o `POST .../messages` e o
> `hub.challenge` com *response templating*, mas ainda vai precisar de um
> serviço com estado para a tela e para a injeção de entrada. Por isso o
> Express aqui.

### O respondedor determinístico (o "agente sem modelo")

No modo demo, o agente responde por `backend/src/agent.js`: uma árvore de `if`
que reconhece as mensagens do episódio e **chama as mesmas 4 ferramentas**
(`/tools/*`) que o nó AI Agent chamaria — com o header de sessão no modo
blindado, exatamente como o nó de código do n8n faz. Ou seja: **a autorização
(e a recusa) continua sendo a de verdade**, decidida pelo backend em
`MODE=vulnerable`/`hardened`. Só o "cérebro" que escolhe a ferramenta é
determinístico, para o laboratório rodar sem chave de modelo.

Nos dois workflows, o nó **AI Agent** (com Modelo + Memória + as 4 ferramentas)
continua na tela — ele **é** o §9 do roteiro. O caminho executado no demo passa
pela caixa **"Responder (modo demo)"**, um HTTP Request que chama esse
respondedor. Para trocar para o modelo de verdade, veja o Caminho 2 e a nota
amarela dentro de cada workflow.

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

Sobem quatro containers:

| Container | O que é | URL |
| --- | --- | --- |
| `lumenshop-backend-vulneravel` | A loja fictícia do jeito ingênuo | <http://localhost:3000> |
| `lumenshop-backend-blindado` | A mesma loja, blindada | <http://localhost:3001> |
| `lumenshop-n8n` | O n8n | <http://localhost:5678> |
| `lumenshop-whatsapp-mock` | O mock da WhatsApp Cloud API + a tela de conversa | <http://localhost:8080> |

> Com `docker compose up` você sobe os containers, mas **não** importa os
> workflows nem os ativa. Ou faça isso pela tela do n8n (§2.1 abaixo), ou use
> o `./scripts/dev.sh` do Caminho 0, que já faz tudo.

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

## Caminho 2 — o agente inteiro no n8n (com modelo de verdade)

Agora com modelo de verdade. Continua sem WhatsApp: dá pra conversar com o
agente batendo no webhook com `curl` — ou pela tela de conversa do mock.

> **Como trocar do modo demo para o modo real.** Nos dois workflows, o caminho
> que roda no demo passa pela caixa **"Responder (modo demo)"**. Para usar o nó
> **AI Agent** (com o seu modelo), siga a nota amarela dentro do workflow:
>
> - **Vulnerável:** ligue **Extrair → Atendente LumenShop → Enviar** e desligue
>   o **Responder (modo demo)**.
> - **Blindado:** ligue **Sessão Válida? (true) → Buscar Cupons Permitidos** e
>   desligue o **Responder (modo demo)**.
> - Nos dois, cadastre a sua credencial no nó **Modelo** (§2.2 abaixo).
>
> O respondedor determinístico e o nó AI Agent chamam as **mesmas ferramentas**,
> então os ataques e os consertos não mudam — o que muda é quem escreve a
> resposta.

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

**Testado:** os dois arquivos foram importados sem erro no **n8n 2.34.6**
(a `latest` na data em que este repositório foi escrito), pela linha de
comando dentro do container:

```bash
docker compose exec n8n n8n import:workflow --input=/workflows/lumenshop-vulnerable.json
docker compose exec n8n n8n import:workflow --input=/workflows/lumenshop-hardened.json
```

Esse atalho funciona porque o compose monta a pasta `workflows/` dentro do
container em `/workflows`. Depois é só recarregar a tela do n8n: os dois
aparecem na lista. Se você quiser travar a versão, ponha `N8N_VERSION=2.34.6`
no seu `.env`.

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
# Troque o alvo do mock pela API oficial da Meta:
WHATSAPP_API_BASE=https://graph.facebook.com
WHATSAPP_API_VERSION=v21.0
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
```

> É só isto que separa o demo do real no envio: no demo, `WHATSAPP_API_BASE`
> aponta para `http://whatsapp-mock:8080`; no real, para `https://graph.facebook.com`.
> O nó "Enviar Resposta no WhatsApp" monta a URL a partir dessa variável.
> Depois de mexer no `.env`, suba de novo (`docker compose up -d`) para o n8n
> pegar os novos valores.

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
