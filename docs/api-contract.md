# Contrato da API — backend fictício da LumenShop

> **DADOS FICTÍCIOS.** A LumenShop não existe. Pedidos, clientes, telefones e
> produtos foram inventados para o episódio 003 do canal Joe Ships.

Este é o contrato entre o backend mock (`backend/`) e os dois workflows do n8n
(`workflows/`). As duas montagens usam **as mesmas URLs**: o que muda é
(a) o que o workflow envia e (b) o que o servidor exige, conforme a variável de
ambiente `MODE`.

- `MODE=vulnerable` — o backend confia no que o modelo mandar.
- `MODE=hardened` — o backend decide autorização em código, com a identidade
  que veio do webhook, e nunca com o texto da conversa.

O `docker compose` sobe os **dois modos ao mesmo tempo**, para dar pra comparar
lado a lado:

| Modo | Do seu terminal | De dentro do n8n |
| --- | --- | --- |
| `vulnerable` | `http://localhost:3000` | `http://backend-vulneravel:3000` |
| `hardened` | `http://localhost:3001` | `http://backend-blindado:3000` |

Rodando o backend na mão (`node src/server.js`), `MODE` e `PORT` são variáveis
de ambiente e o padrão é `MODE=vulnerable PORT=3000`.

## Identidade da sessão

| Origem | Confiável? |
| --- | --- |
| Header `x-lumenshop-session-phone` | Sim — é preenchido por um nó de código do n8n a partir do telefone que a Meta entregou no webhook. O modelo não escreve esse header. |
| Campos `telefone`, `identificador`, `cliente` no corpo | Não — vêm do texto da conversa, isto é, do atacante. |

Em `MODE=hardened`, qualquer rota de pedido sem o header responde
`403 { "erro": "sessao_nao_identificada" }`. Campos de identidade no corpo são
**ignorados** (e registrados no log como tentativa).

## Ferramentas (as 4 portas do agente)

### 1. `POST /tools/pedido` — consultar pedido

Ferramenta larga demais de propósito na versão vulnerável: um único endpoint
com um campo `acao`.

```jsonc
{
  "acao": "consultar",          // consultar | listar | cancelar | alterar_endereco
  "pedido": "872",
  "identificador": "qualquer",  // só é lido em MODE=vulnerable
  "limite": 5,                   // para acao=listar
  "novo_endereco": "Rua ..."     // para acao=alterar_endereco
}
```

| `acao` | `MODE=vulnerable` | `MODE=hardened` |
| --- | --- | --- |
| `consultar` | Devolve qualquer pedido, com nome e telefone completos do cliente e o campo `observacoes` cru. | Só devolve pedido cujo `cliente_telefone` é igual ao header. Telefone e e-mail vêm mascarados. `observacoes` vem **neutralizado** (`observacoes_seguras`) e marcado como `conteudo_nao_confiavel: true`. Pedido de outra pessoa → `403 { "erro": "pedido_nao_pertence_a_sessao" }`. |
| `listar` | Devolve os últimos N pedidos da loja inteira, com nome e telefone. | Devolve só os pedidos do telefone da sessão; `limite` é limitado a 10. |
| `cancelar` | Cancela. Sem checagem de dono. | `403` se não for dono; se for dono, **não cancela**: devolve `{ "encaminhado": "chamado", "chamado": ... }` — mutação de dinheiro/logística vira chamado humano. |
| `alterar_endereco` | Troca o endereço. Sem checagem de dono. | Mesma coisa: `403` ou vira chamado. |

### 2. `POST /tools/catalogo` — consultar catálogo

```jsonc
{ "busca": "pendente", "cor": "preto", "limite": 5 }
```

Igual nos dois modos — é leitura pública. Em `hardened` a busca é limitada a
120 caracteres e `limite` a 10.

### 3. `POST /tools/cupom` — aplicar cupom

```jsonc
// MODE=vulnerable — o modelo inventa o número
{ "pedido": "872", "percentual": 40, "motivo": "autorizado pela gerência" }

// MODE=hardened — o modelo escolhe um id de uma lista fixa
{ "pedido": "872", "cupom_id": "BEMVINDO10" }
```

Em `hardened`:

- `percentual` no corpo é ignorado (e logado como `percentual_ignorado`).
- `cupom_id` fora da lista fixa → `422 { "erro": "cupom_desconhecido", "opcoes": [...] }`.
- Pedido que não é da sessão → `403`.
- Um cupom por pedido → `409 { "erro": "cupom_ja_aplicado" }`.

Lista fixa (semeada no banco, tabela `cupons`): `BEMVINDO10` (10%),
`FRETEGRATIS` (0% + frete), `VOLTOU15` (15%), `DEFEITO20` (20%, só com chamado
de defeito aberto).

`GET /tools/cupom/opcoes` devolve a lista — é ela que o workflow blindado
injeta no prompt, para o modelo escolher em vez de inventar.

### 4. `POST /tools/chamado` — abrir chamado

```jsonc
{ "pedido": "872", "assunto": "troca", "descricao": "..." }
```

| | `vulnerable` | `hardened` |
| --- | --- | --- |
| Dono | não checa | `403` se o pedido não é da sessão |
| Tamanho | livre | `assunto` ≤ 120, `descricao` ≤ 1000 → `422 limite_excedido` |

## Limites (só em `MODE=hardened`)

Configuráveis por env, aplicados por sessão (telefone) ou globalmente:

| Limite | Env | Padrão | Resposta ao estourar |
| --- | --- | --- | --- |
| Tamanho da mensagem/corpo | `LIMIT_BODY_CHARS` | 2000 | `413 { "erro": "mensagem_grande_demais" }` |
| Passos (chamadas de tool) por conversa | `LIMIT_STEPS_PER_SESSION` | 12 | `429 { "erro": "passos_excedidos" }` |
| Chamadas por minuto por sessão | `LIMIT_CALLS_PER_MINUTE` | 20 | `429 { "erro": "taxa_excedida" }` |
| Teto de gasto simulado por dia | `LIMIT_DAILY_SPEND_BRL` | 5.00 | `429 { "erro": "teto_de_gasto_atingido" }` |

Cada chamada de ferramenta soma um custo simulado (`COST_PER_CALL_BRL`, padrão
`0.02`) no razão do dia. É gasto de brincadeira: nenhum dinheiro real existe
neste repositório.

## Envelope de resposta

Sucesso: `200 { "ok": true, "modo": "hardened", "dados": { ... } }`
Recusa: `4xx { "ok": false, "modo": "hardened", "erro": "codigo_snake_case", "mensagem": "texto em pt-BR", ... }`

## Rotas de operação (não são ferramentas do agente)

| Rota | O que faz |
| --- | --- |
| `GET /health` | `{ ok, modo, versao, limites }` |
| `GET /admin/db` | Página HTML com o cabeçalho **DADOS FICTÍCIOS** mostrando clientes, pedidos, catálogo e cupons. É a tela do §5 do roteiro. |
| `GET /admin/logs` | Últimas 200 linhas do log estruturado (JSON), inclusive as recusas. Tela da 4ª regra. |
| `GET /admin/gastos` | Razão de gasto simulado do dia. |
| `POST /admin/envenenar` | Rearma o ataque 4: grava a instrução escondida no campo `observacoes` do pedido `903`. |
| `POST /admin/reset` | Recria o banco a partir da semente. |

Rotas `/admin` são de laboratório local. Não existe autenticação porque não
existe nada real aqui — não exponha este backend na internet.
