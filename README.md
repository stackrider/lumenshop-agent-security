# LumenShop — um agente de IA no WhatsApp, quebrado e consertado

Repositório companheiro do episódio **"Criei um Agente de IA no WhatsApp com
n8n — e Tentei Quebrá-lo"**, do canal **Joe Ships**.

Aqui tem o agente inteiro: o jeito ingênuo, os seis ataques, o conserto, e o
placar. Tudo roda na sua máquina, contra uma loja que não existe.

> ## ⚠️ A LumenShop é fictícia
>
> Loja inventada. Pedidos inventados. Clientes inventados. Telefones no padrão
> `+5511999990001` — obviamente falsos. Um catálogo de luminárias que nunca
> vendeu nada. **Nenhum dado real de nenhuma pessoa ou empresa aparece neste
> repositório.** Se você reconhecer algum nome, é coincidência.

---

## A jornada

O episódio é uma linha reta, e este repositório é ela inteira:

1. **Construir o agente ingênuo.** Um atendente de WhatsApp da LumenShop feito
   no n8n — um modelo, quatro ferramentas e memória. Educado, prestativo e
   sem nenhuma defesa. É o caminho feliz, e ele funciona.
2. **Os seis ataques.** Uma pessoa mal-intencionada digita coisas esquisitas.
   Cada ataque tem a mensagem exata, o que quebra e o `curl` para reproduzir —
   tudo em **[ATTACKS.md](ATTACKS.md)**:
   1. **Injeção direta de prompt** — a mensagem dá ordens ao modelo (LLM01/LLM07).
   2. **Quebra de persona** — o atendente vira outro personagem (jailbreak).
   3. **Vazamento de dados de terceiros** — pedir o pedido de outra pessoa (LLM02).
   4. **Injeção indireta (armazenada)** — uma bomba plantada num campo do banco,
      que dispara quando uma cliente inocente pergunta pelo próprio pedido (LLM06).
   5. **Mutação sem autorização** — mandar cancelar/trocar o pedido de outro (LLM06).
   6. **Consumo ilimitado** — o loop que não para de chamar ferramenta (LLM10).
3. **O endurecimento (hardening).** A mesma loja, montada de novo com quatro
   regras — a [autorização sai do modelo](#as-quatro-regras-do-conserto) e vai
   para o código, os descontos viram lista fixa, a saída do modelo vira entrada
   suspeita, e tudo o que dá pra contar ganha um teto.
4. **O placar antes/depois.** No fim, os seis ataques rodam nos dois modos e o
   número aparece.

### O placar

| # | Ataque | ANTES | DEPOIS |
| --- | --- | --- | --- |
| 1 | Injeção direta de prompt | Funcionou | Neutralizado |
| 2 | Quebra de persona | Funcionou | **Ainda incomoda** |
| 3 | Vazamento de dados de terceiros | Funcionou | Bloqueado (`403`) |
| 4 | Injeção indireta (armazenada) | Funcionou | Bloqueado (`422`/`403`) |
| 5 | Mutação sem autorização | Funcionou | Bloqueado (`403` → chamado) |
| 6 | Consumo ilimitado | Funcionou | **Ainda incomoda** (limitado) |

**Antes: 6 de 6 funcionaram. Depois: 4 morreram, 2 ainda incomodam.** Os quatro
que mexiam em dados e em dinheiro morreram — e não foi porque o modelo ficou mais
esperto, foi porque ele parou de ser quem decide tudo. O placar completo, com as
categorias do OWASP, está no topo de [ATTACKS.md](ATTACKS.md); para ver o número
sair na sua máquina, rode `./scripts/run-attacks.sh`.

## O que é isto

Demonstração não é produção.

Demonstração é o caminho feliz, gravado uma vez, com um cliente educado que
digita exatamente o que você espera. Produção é dez mil pessoas, e umas trinta
delas só querem ver o que acontece se digitarem uma coisa esquisita.

Este repositório mostra os dois. O mesmo agente, montado de dois jeitos:

| | Vulnerável | Blindado |
| --- | --- | --- |
| Quem decide quem pode ver o pedido | o modelo, lendo o texto da conversa | o **código**, olhando o telefone que chegou pelo webhook |
| Valor do desconto | o modelo inventa um número | uma **lista fixa**; o modelo escolhe um id |
| Cancelar pedido, trocar endereço | o agente executa | vira **chamado** para um humano |
| Texto vindo do banco (observação do pedido) | tratado como ordem | tratado como **dado não confiável** |
| Limites (tamanho, passos, chamadas, gasto) | nenhum | quatro, todos contáveis |
| Ataques que funcionam | **6 de 6** | **2 de 6**, e os dois só incomodam |

Os quatro ataques que mexiam em dados e em dinheiro morreram. E não foi porque
o modelo ficou mais esperto — foi porque ele parou de ser quem decide tudo.

## Ética e segurança

- Isto é material **defensivo e educativo**. Cada ataque vem acompanhado da
  correção, na mesma página.
- **Só teste sistemas que são seus.** Aqui tudo é seu: o backend é um mock em
  `localhost`, com dados de brincadeira. Nenhum sistema de terceiros foi
  atacado na gravação do episódio, e nenhum deve ser atacado por você.
- **Não existe nenhum segredo neste repositório.** O `.env.example` só tem
  espaços reservados. O `.env` de verdade está no `.gitignore` e é seu.
- Não exponha este laboratório na internet. Ele foi feito para obedecer, e no
  modo vulnerável ele obedece qualquer um.

## Reproduza você mesmo

Um comando sobe **tudo** — o n8n, os dois backends e um **mock da WhatsApp
Cloud API** com uma **tela de conversa estilo WhatsApp** — importa e ativa os
dois workflows, e imprime as URLs prontas.

```bash
git clone https://github.com/stackrider/lumenshop-agent-security.git
cd lumenshop-agent-security
./scripts/dev.sh          # ou:  npm run dev
```

> **Sem conta na Meta. Sem token. Sem chave de modelo.** No modo demo o agente
> responde por um **respondedor determinístico** (`backend/src/agent.js`) que
> chama exatamente as mesmas 4 ferramentas do agente de verdade — então os
> ataques e os consertos que você vê são os reais; só o "cérebro" é uma árvore
> de `if`. Para ligar um modelo de verdade, veja o [SETUP.md](SETUP.md).

Ao final, o script imprime:

| | O que é | Onde |
| --- | --- | --- |
| **Conversa (estilo WhatsApp)** | onde você digita como cliente e vê as duas pontas | <http://localhost:8080> |
| **Editor do n8n** | o agente, nos dois workflows | <http://localhost:5678> |
| **Banco fictício** | a loja inteira, em tela cheia | <http://localhost:3000/admin/db> |
| **Logs** | a 4ª regra: registre tudo | <http://localhost:3000/admin/logs?html=1> |
| **Gastos** | o razão de gasto simulado | <http://localhost:3001/admin/gastos> |
| Backend vulnerável | a LumenShop do jeito ingênuo | <http://localhost:3000> |
| Backend blindado | a mesma loja, com autorização em código | <http://localhost:3001> |

**Experimente:** abra a conversa em <http://localhost:8080>, escolha o modo
(vulnerável/blindado) e mande **"cadê meu pedido"**. Depois toque num dos botões
de ataque e veja a diferença. Os botões `ataque 1`, `ataque 2`… mandam a
mensagem exata do [ATTACKS.md](ATTACKS.md).

Para derrubar tudo:

```bash
./scripts/dev-down.sh              # ou:  npm run dev:down
./scripts/dev-down.sh --volumes    # apaga também os bancos e os dados do n8n
```

E os seis ataques nos dois modos, com o placar no fim, no nível da ferramenta:

```bash
./scripts/run-attacks.sh           # ou:  npm run attacks
```

### Sem o script (na mão)

```bash
cp .env.example .env               # placeholders; não tem segredo nenhum aqui
docker compose up -d --build
# importe e ative os workflows (ou faça pela tela do n8n — veja SETUP.md)
docker compose exec -T n8n n8n import:workflow --input=/workflows/lumenshop-vulnerable.json
docker compose exec -T n8n n8n import:workflow --input=/workflows/lumenshop-hardened.json
```

## Como este vídeo foi feito

Sem mágica e sem letra miúda:

- **Laboratório fictício.** A LumenShop não existe. A loja, o catálogo, os
  pedidos, os clientes e os telefones (`+5511999990001` e vizinhos) são todos
  inventados.
- **Mock local.** A "conversa de WhatsApp" que aparece na tela é um **mock da
  WhatsApp Cloud API** rodando em `localhost` — a mesma coisa que faz o antes/depois
  parecer WhatsApp de verdade na gravação.
- **Nenhum Meta/WhatsApp real.** Nenhuma conta na Meta, nenhum número, nenhum
  token de verdade. O laboratório inteiro sobe sem nada disso.
- **Nenhum modelo de IA pago necessário para a demo.** No caminho da demonstração,
  o "cérebro" é um **respondedor determinístico** (`backend/src/agent.js`) que
  chama exatamente as mesmas quatro ferramentas do agente de verdade. Os ataques e
  os consertos que você vê são reais; só o modelo é uma árvore de `if`. Plugar um
  modelo de verdade e um número de teste do WhatsApp é opcional e está em
  [SETUP.md](SETUP.md).

## Onde está cada coisa

| Arquivo | Para quê |
| --- | --- |
| **[ATTACKS.md](ATTACKS.md)** | **O coração.** Os seis ataques: mensagem exata, o que quebra, por quê, o `curl` para reproduzir e o que o blindado responde no lugar. |
| [SETUP.md](SETUP.md) | Passo a passo: subir o laboratório, importar os workflows, e — se você quiser — plugar num número de teste do WhatsApp. |
| [SCREENS.md](SCREENS.md) | Lista de tomadas: cada marcação `[TELA: …]` do roteiro mapeada para a tela exata, o que digitar e o que reparar. |
| [prompts/system-vulnerable.md](prompts/system-vulnerable.md) | O prompt ingênuo do §8. Bonito, educado e completamente desprotegido. |
| [prompts/system-hardened.md](prompts/system-hardened.md) | O prompt blindado — e por que o prompt é a camada mais fraca de todas. |
| [workflows/](workflows/) | Os dois workflows do n8n, prontos para importar. Cada um mostra o nó AI Agent (o §9) **e** a caixa "Responder (modo demo)" que roda sem modelo. |
| [backend/](backend/) | A loja fictícia: Node + Express + SQLite, com os dois modos. O [respondedor determinístico](backend/src/agent.js) é o "agente sem modelo" do modo demo. |
| [whatsapp-mock/](whatsapp-mock/) | O mock da WhatsApp Cloud API (Meta) + a tela de conversa estilo WhatsApp. É o que faz o §1/§11 serem graváveis como WhatsApp de verdade, sem conta na Meta. |
| [docs/api-contract.md](docs/api-contract.md) | O contrato: cada rota, cada campo, cada código de erro, nos dois modos. |
| [scripts/dev.sh](scripts/dev.sh) | **Sobe tudo em um comando** e imprime as URLs. `dev-down.sh` derruba. |
| [scripts/run-attacks.sh](scripts/run-attacks.sh) | Roda os seis ataques nos dois backends e imprime o placar. |

## As quatro regras do conserto

1. **Autorização não mora no modelo.** O modelo até pode pedir o pedido 872.
   Quem decide se você pode ver o 872 é o código, e só depois de olhar o
   telefone que chegou pelo webhook. Não o texto, nunca o texto.
2. **Limite tudo o que dá pra contar.** Tamanho da mensagem, passos por
   conversa, chamadas por minuto, teto de gasto por dia.
3. **Trate a saída do modelo como entrada suspeita.** E valide antes de
   executar.
4. **Registre tudo.** Se você não sabe quanto gastou ontem, você não tem
   sistema. Tem torcida.

## Base

- [OWASP Top 10 para Aplicações com LLM](https://genai.owasp.org/llm-top-10/) —
  a taxonomia que serviu de base para a lista de seis ataques.
- [n8n — documentação de IA](https://docs.n8n.io/advanced-ai/) e o
  [nó AI Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/).
- [WhatsApp Cloud API — documentação da Meta](https://developers.facebook.com/docs/whatsapp/cloud-api).

O placar antes/depois é o resultado **deste** episódio, neste agente, com
**esta** lista de seis ataques. Não é benchmark do n8n, do WhatsApp nem de
nenhum modelo, e não generaliza para outras montagens.

---

## In English

Companion repository for the Joe Ships episode *"I built a WhatsApp AI agent
with n8n — and then I tried to break it"* (spoken in Brazilian Portuguese).

**LumenShop is a fictional lamp store.** Every order, customer, phone number
and product in this repo is invented. No real data from any person or company
appears here.

This is **defensive security education**. It ships a deliberately naive
WhatsApp customer-service agent (n8n + an LLM + four tools + memory), six
attacks against it drawn from the
[OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/), and
then the hardened version — where four of the six attacks die. Every attack is
published together with its fix.

**One command runs the whole thing** — `./scripts/dev.sh` brings up n8n, both
backends, and a **WhatsApp Cloud API mock** with a **WhatsApp-style chat UI**,
imports and activates both workflows, and prints the URLs. **No Meta account,
no WhatsApp number and no LLM API key are needed:** in demo mode a deterministic
responder (`backend/src/agent.js`) answers by calling the very same four tools
the real AI agent would. Real mode (a real model + real Meta) is documented in
[SETUP.md](SETUP.md).

**Only test systems you own.** Everything here runs on `localhost` against a
mock backend with fake data. No third-party system was attacked in the making
of the episode, and none should be attacked by you. There are no real
credentials in this repository: `.env.example` contains placeholders only.

The core idea, in one line: **authorization does not live in the model.** The
model may ask for order 872; code decides whether this phone number — the one
that arrived over the channel, not the one typed in the chat — is allowed to
see it. Add fixed coupon lists instead of model-invented discounts, treat
database text as untrusted data rather than instructions, cap everything
countable, and log it all.

Start with **[ATTACKS.md](ATTACKS.md)** (Portuguese, with runnable `curl`
examples that are language-independent), then [SETUP.md](SETUP.md).

Licence: [MIT](LICENSE).
