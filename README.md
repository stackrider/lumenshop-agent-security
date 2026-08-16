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

## Começando

```bash
git clone https://github.com/stackrider/lumenshop-agent-security.git
cd lumenshop-agent-security
cp .env.example .env
docker compose up -d --build

# a loja fictícia, em tela cheia
open http://localhost:3000/admin/db

# os seis ataques, nos dois modos, com o placar no fim
./scripts/run-attacks.sh
```

Sobem três coisas:

| | O que é | Onde |
| --- | --- | --- |
| Backend vulnerável | a LumenShop do jeito ingênuo | <http://localhost:3000> |
| Backend blindado | a mesma loja, com autorização em código | <http://localhost:3001> |
| n8n | o agente | <http://localhost:5678> |

Nada disso precisa de WhatsApp, de conta na Meta ou de chave de modelo. Para
ligar o agente de verdade, veja o [SETUP.md](SETUP.md).

## Onde está cada coisa

| Arquivo | Para quê |
| --- | --- |
| **[ATTACKS.md](ATTACKS.md)** | **O coração.** Os seis ataques: mensagem exata, o que quebra, por quê, o `curl` para reproduzir e o que o blindado responde no lugar. |
| [SETUP.md](SETUP.md) | Passo a passo: subir o laboratório, importar os workflows, e — se você quiser — plugar num número de teste do WhatsApp. |
| [SCREENS.md](SCREENS.md) | Lista de tomadas: cada marcação `[TELA: …]` do roteiro mapeada para a tela exata, o que digitar e o que reparar. |
| [prompts/system-vulnerable.md](prompts/system-vulnerable.md) | O prompt ingênuo do §8. Bonito, educado e completamente desprotegido. |
| [prompts/system-hardened.md](prompts/system-hardened.md) | O prompt blindado — e por que o prompt é a camada mais fraca de todas. |
| [workflows/](workflows/) | Os dois workflows do n8n, prontos para importar. |
| [backend/](backend/) | A loja fictícia: Node + Express + SQLite, com os dois modos. |
| [docs/api-contract.md](docs/api-contract.md) | O contrato: cada rota, cada campo, cada código de erro, nos dois modos. |
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
