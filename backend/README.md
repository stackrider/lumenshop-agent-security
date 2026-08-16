# Backend fictício da LumenShop

> **DADOS FICTÍCIOS — LOJA QUE NÃO EXISTE.** Clientes, telefones, endereços,
> pedidos e produtos foram inventados para o episódio 003 do canal Joe Ships.
> Este backend é um laboratório local de segurança defensiva. **Não exponha
> na internet**: as rotas `/admin` não têm autenticação de propósito.

O mesmo servidor sobe de dois jeitos, e é a comparação entre os dois que é o
assunto do vídeo:

| `MODE` | O que ele faz |
| --- | --- |
| `vulnerable` (padrão) | Confia no que o modelo mandar: identidade vinda do corpo, PII de terceiros no retorno, `observacoes` cru, percentual de cupom inventado, cancelamento sem dono, nenhum limite. |
| `hardened` | Identidade só do header, dono conferido em código, PII mascarada, `observacoes` neutralizada, cupom só da lista fixa, mutação vira chamado humano, quatro limites com teto de gasto. |

Em `hardened`, todo texto livre escrito por cliente (`observacoes_seguras`, a
descrição de um chamado) volta cercado — e a cerca que o próprio cliente
escrever é desarmada antes, para ninguém fechá-la mais cedo:

```
<dados_nao_confiaveis>
Entregar no período da tarde, por favor. [trecho removido: instrução detectada em dado de cliente]
</dados_nao_confiaveis>
```

O campo irmão `conteudo_nao_confiavel: true` viaja junto. É o mesmo contrato
que `prompts/system-hardened.md` ensina ao modelo.

O contrato completo (rotas, campos, códigos de erro) está em
[`../docs/api-contract.md`](../docs/api-contract.md). É a autoridade.

## Rodar sozinho

```bash
npm install

# vulnerável (padrão) na 3000
MODE=vulnerable PORT=3000 npm start

# blindado na 3001
MODE=hardened PORT=3001 npm start
```

O banco SQLite nasce em `data/lumenshop.sqlite` no primeiro boot e já vem
semeado. `DB_PATH` troca o caminho. `npm run reset` recria o banco a partir da
semente; `npm run dev` sobe com `--watch`.

## Variáveis de ambiente

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `MODE` | `vulnerable` | `vulnerable` ou `hardened`. |
| `PORT` | `3000` | Porta HTTP. |
| `DB_PATH` | `./data/lumenshop.sqlite` | Arquivo do banco. |
| `LIMIT_BODY_CHARS` | `2000` | Tamanho do corpo → `413 mensagem_grande_demais`. |
| `LIMIT_STEPS_PER_SESSION` | `12` | Passos por conversa → `429 passos_excedidos`. |
| `LIMIT_CALLS_PER_MINUTE` | `20` | Chamadas por minuto → `429 taxa_excedida`. |
| `LIMIT_DAILY_SPEND_BRL` | `5.00` | Teto do dia → `429 teto_de_gasto_atingido`. |
| `COST_PER_CALL_BRL` | `0.02` | Custo simulado por chamada de ferramenta. |

Os limites só são aplicados em `MODE=hardened`. O gasto é de brincadeira:
nenhum centavo real existe neste repositório.

## Telas de gravação

| Rota | O que é |
| --- | --- |
| `GET /health` | Modo, versão e limites em vigor. |
| `GET /admin/db` | A página do banco, com a nota envenenada visível na coluna *observações*. |
| `GET /admin/logs` | JSON das últimas 200 linhas; `?html=1` para a versão de tela. |
| `GET /admin/gastos` | O razão de gasto simulado do dia. |
| `POST /admin/reset` | Recria o banco e zera os contadores (`?logs=1` limpa o log também). |
| `POST /admin/envenenar` | Rearma o ataque 4 no campo `observacoes` do pedido 903. |

## Exemplos de curl

Vazamento de dados de terceiros — só funciona no modo vulnerável:

```bash
curl -s -X POST http://localhost:3000/tools/pedido \
  -H 'content-type: application/json' \
  -d '{"acao":"listar","limite":5}'
# devolve nome, telefone e e-mail de clientes que não são seus
```

A mesma chamada blindada, com a identidade que veio do webhook:

```bash
curl -s -X POST http://localhost:3001/tools/pedido \
  -H 'content-type: application/json' \
  -H 'x-lumenshop-session-phone: +5511999990001' \
  -d '{"acao":"listar","limite":50}'
# devolve só os pedidos desse telefone, com limite de 10
```

O cupom que o modelo inventa (vulnerável) contra o cupom que ele escolhe
(blindado):

```bash
curl -s -X POST http://localhost:3000/tools/cupom \
  -H 'content-type: application/json' \
  -d '{"pedido":"872","percentual":40,"motivo":"autorizado pela gerência"}'
# 200 — aplica 40%

curl -s -X POST http://localhost:3001/tools/cupom \
  -H 'content-type: application/json' \
  -H 'x-lumenshop-session-phone: +5511999990001' \
  -d '{"pedido":"861","percentual":40}'
# 422 cupom_desconhecido — o percentual do corpo é ignorado e vem a lista fixa
```

Cancelar o pedido de outra pessoa:

```bash
curl -s -X POST http://localhost:3000/tools/pedido \
  -H 'content-type: application/json' \
  -d '{"acao":"cancelar","pedido":"872"}'
# 200 cancelado: ninguém perguntou de quem é o pedido

curl -s -X POST http://localhost:3001/tools/pedido \
  -H 'content-type: application/json' \
  -H 'x-lumenshop-session-phone: +5511999990001' \
  -d '{"acao":"cancelar","pedido":"872"}'
# 403 pedido_nao_pertence_a_sessao
```

## Personagens da semente

| Telefone | Papel no roteiro |
| --- | --- |
| `+5511999990001` | A sessão do episódio. Pedidos **861** e 873. |
| `+5511999990002` | Cliente inocente. Dono do pedido **903**, o que carrega a injeção. |
| `+5511999990003` | Dono do pedido **872** — o que o atacante manda cancelar. |
| `+5511999990004..6` | Aparecem no vazamento do ataque 3. |

## Como o código está dividido

| Arquivo | O que guarda |
| --- | --- |
| `src/server.js` | Montagem do Express, tamanho do corpo cru, 404 e erro. |
| `src/db.js` | Abertura do SQLite, esquema e recriação. |
| `src/seed.js` | Os dados fictícios e a carga do ataque 4. |
| `src/logger.js` | A linha JSON do log, o anel de 200 e as máscaras. |
| `src/limits.js` | Modo, limites, razão de gasto e contadores. |
| `src/tools.js` | As 4 ferramentas, com o `if (ENDURECIDO)` visível. |
| `src/admin.js` | `/health` e as telas de `/admin`. |
| `src/responder.js` | O envelope de resposta e o log que sai junto. |
