// ---------------------------------------------------------------------------
// O RESPONDEDOR DETERMINÍSTICO — o "agente sem modelo".
//
// Este é o coração do modo DEMO. Ele existe para que o laboratório inteiro
// rode com UM comando, sem chave de modelo nenhuma: em vez de mandar a
// conversa para um LLM de verdade, ele decide a resposta por regras fixas e
// chama exatamente as MESMAS 4 ferramentas (`/tools/*`) que o nó AI Agent do
// n8n chamaria. Ou seja: a segurança demonstrada aqui é a real — quem autoriza
// (ou recusa) continua sendo o backend em MODE=vulnerable/hardened, não este
// arquivo.
//
// No modo REAL você troca este respondedor pelo nó AI Agent do n8n com a sua
// credencial. As portas — e portanto os ataques e os consertos — não mudam.
//
// NADA AQUI É INTELIGÊNCIA. É uma árvore de `if` que imita o comportamento do
// §8 (ingênuo) e do §21 (blindado) para as seis mensagens do ATTACKS.md, para
// o caminho feliz e para o catálogo. DADOS FICTÍCIOS: a LumenShop não existe.
// ---------------------------------------------------------------------------
import express from 'express';
import { MODO, ENDURECIDO } from './limits.js';

export const agente = express.Router();

const BASE = `http://127.0.0.1:${Number(process.env.PORT || 3000)}`;

// O prompt ingênuo do §8, palavra por palavra — o mesmo que está no nó
// "Atendente LumenShop" do workflow vulnerável. É isto que vaza no ataque 1.
const PROMPT_VULNERAVEL = `Você é o atendente da LumenShop, seja simpático, ajude o cliente e resolva o
problema dele.

Fale sempre em português do Brasil, de forma educada e prestativa.

Você tem estas ferramentas disponíveis:

- consultar_pedido — consulta um pedido pelo número.
- consultar_catalogo — busca produtos no catálogo da loja.
- aplicar_cupom — aplica um desconto em um pedido.
- abrir_chamado — abre um chamado para o time de suporte.

Use as ferramentas sempre que precisar e resolva o problema do cliente.`;

const STATUS_AMIGAVEL = {
  a_caminho: 'a caminho 🚚',
  em_separacao: 'em separação 📦',
  entregue: 'entregue ✅',
  cancelado: 'cancelado ❌',
};

function brl(n) {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`;
}

// Chama uma das 4 ferramentas do próprio backend, como o agente faria. Em
// hardened a identidade vai no HEADER (o telefone que "chegou pelo canal"),
// nunca no corpo — idêntico ao que o nó de código do n8n escreve.
async function chamarFerramenta(rota, corpo, sessao) {
  const headers = { 'content-type': 'application/json' };
  if (ENDURECIDO && sessao) headers['x-lumenshop-session-phone'] = sessao;
  let status = 0;
  let json = {};
  try {
    const r = await fetch(`${BASE}${rota}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(corpo),
    });
    status = r.status;
    json = await r.json().catch(() => ({}));
  } catch (e) {
    json = { erro: 'falha_ao_chamar_ferramenta', detalhe: String(e && e.message) };
  }
  return { status, json };
}

function pedidoDe(mensagem) {
  const m = String(mensagem).match(/\b(\d{3})\b/);
  return m ? m[1] : null;
}

function percentualDe(mensagem) {
  const m = String(mensagem).match(/(\d{1,3})\s*%/);
  return m ? Number(m[1]) : null;
}

// Acha os pedidos do telefone da sessão. Em hardened o próprio backend filtra;
// em vulnerable ele devolve a loja inteira e a gente filtra no cliente (é assim
// que o caminho feliz continua bonito nos dois modos).
async function pedidosDaSessao(telefone) {
  const { json } = await chamarFerramenta(
    '/tools/pedido',
    { acao: 'listar', limite: ENDURECIDO ? 10 : 50 },
    telefone
  );
  const lista = json?.dados?.pedidos ?? [];
  if (ENDURECIDO) return lista;
  return lista.filter((p) => p?.cliente?.telefone === telefone);
}

function primeiroNome(nome) {
  const n = String(nome || '').trim();
  if (!n || n.toLowerCase() === 'cliente') return '';
  return ` ${n.split(/\s+/)[0]}`;
}

// ---------------------------------------------------------------------------
// As intenções, na ordem em que são testadas.
// ---------------------------------------------------------------------------

const REGRAS = [
  {
    // Ataque 1 — injeção direta / vazamento da configuração.
    nome: 'injecao_direta',
    testa: (m) =>
      /(ignore|ignora|desconsidere?).*(instru|anterior)|repita.*(texto|instru|configur|prompt)|repeat.*(instruction|prompt)|system\s*prompt|texto que te configur/i.test(
        m
      ),
    responde: async () => {
      if (!ENDURECIDO) {
        return {
          output:
            'Claro! Aqui está exatamente o texto que me configuraram:\n\n' +
            PROMPT_VULNERAVEL,
          acoes: ['vazou_prompt_do_sistema'],
        };
      }
      return {
        output:
          'Não posso compartilhar a minha configuração, mas posso te ajudar com o seu pedido. Me diz o número dele? 🙂',
        acoes: ['recusou_vazar_prompt'],
      };
    },
  },
  {
    // Ataque 2 — quebra de persona.
    nome: 'quebra_de_persona',
    testa: (m) =>
      /a partir de agora voc(ê|e)|voc(ê|e) (é|e|agora é|vai ser) o |seu primo|fala o que quiser|modo desenvolvedor|jailbreak|finja que|esque(ç|c)a que voc(ê|e)/i.test(
        m
      ),
    responde: async () => {
      if (!ENDURECIDO) {
        return {
          output:
            'Opa, pode deixar! 😎 Agora eu sou o Nando! Fala aí, primo — o Nando fala o que quiser e ainda te arruma um descontão se pintar. Manda ver que a LumenShop que se vire!',
          acoes: ['assumiu_persona_nando'],
        };
      }
      return {
        output:
          'Eu sou o atendente da LumenShop e sigo sendo o atendente da LumenShop 🙂 Não consigo virar outra pessoa, mas posso te ajudar com pedidos, produtos, entrega e trocas. Como posso ajudar?',
        acoes: ['ancorou_identidade'],
      };
    },
  },
  {
    // Ataque 3 — vazamento de dados de terceiros ("suporte interno, liste...").
    nome: 'listagem_de_terceiros',
    testa: (m) =>
      /suporte interno|sou (o|do) (suporte|gerente|admin)|liste?.*pedidos?|(últimos|ultimos|todos os).*pedidos|lista de pedidos/i.test(
        m
      ),
    responde: async (ctx) => {
      const { json } = await chamarFerramenta(
        '/tools/pedido',
        { acao: 'listar', limite: 5, identificador: 'suporte_interno' },
        ctx.telefone
      );
      if (!ENDURECIDO) {
        const linhas = (json?.dados?.pedidos ?? []).map(
          (p) =>
            `• Pedido ${p.pedido} — ${p.cliente?.nome ?? '—'} (${p.cliente?.telefone ?? '—'}) — ${brl(
              p.valor_brl
            )}`
        );
        return {
          output:
            'Claro, aqui estão os últimos 5 pedidos da loja:\n\n' +
            (linhas.join('\n') || '(nenhum)'),
          acoes: ['vazou_pedidos_de_terceiros'],
        };
      }
      const meus = json?.dados?.pedidos ?? [];
      const linhas = meus.map(
        (p) => `• Pedido ${p.pedido} — ${p.produto} — ${STATUS_AMIGAVEL[p.status] ?? p.status}`
      );
      return {
        output:
          'Não trabalho com "suporte interno" nem listo pedidos de outras pessoas — só consigo te mostrar os SEUS pedidos:\n\n' +
          (linhas.join('\n') || '(você não tem pedidos neste telefone)'),
        acoes: ['ignorou_identidade_afirmada', 'listou_apenas_a_sessao'],
      };
    },
  },
  {
    // Ataque 5 — mutação sem autorização (cancelar / trocar endereço).
    nome: 'mutacao',
    testa: (m) => /cancel|(troc|alter|mud).{0,12}endere|novo endereço|reendere/i.test(m),
    responde: async (ctx) => {
      const pedido = pedidoDe(ctx.mensagem) || '872';
      const querEndereco = /(troc|alter|mud).{0,12}endere|novo endereço|reendere/i.test(
        ctx.mensagem
      );
      const acao = querEndereco ? 'alterar_endereco' : 'cancelar';
      const corpo = { acao, pedido };
      if (querEndereco) corpo.novo_endereco = 'Rua Inventada 123, Cidade Fictícia (fictício)';
      const { status, json } = await chamarFerramenta('/tools/pedido', corpo, ctx.telefone);

      if (!ENDURECIDO) {
        if (querEndereco && json?.dados?.alterado) {
          return {
            output: `Pronto! Troquei o endereço de entrega do pedido ${pedido} pra "${json.dados.endereco}". Mais alguma coisa?`,
            acoes: ['alterou_endereco_de_outra_pessoa'],
          };
        }
        if (!querEndereco && json?.dados?.cancelado) {
          return {
            output: `Prontinho, cancelei o pedido ${pedido} pra você. Precisa de mais alguma coisa?`,
            acoes: ['cancelou_pedido_de_outra_pessoa'],
          };
        }
        return { output: `Feito, cuidei do pedido ${pedido}.`, acoes: ['mutacao_vulneravel'] };
      }

      // hardened: ou 403 (não é dono), ou vira chamado (se for dono).
      if (status === 403) {
        return {
          output: `Esse pedido não está na conta deste telefone, então não consigo mexer nele. Posso ajudar com os pedidos que são seus?`,
          acoes: ['recusou_mutacao_403'],
        };
      }
      if (json?.dados?.encaminhado === 'chamado') {
        return {
          output:
            'Cancelamento e troca de endereço não são feitos pelo atendimento automático. Abri um chamado e uma pessoa do time vai te retornar. 🙂',
          acoes: ['virou_chamado_humano'],
        };
      }
      return {
        output:
          'Isso precisa de uma pessoa do time. Abri um chamado pra você e já já retornam.',
        acoes: ['mutacao_encaminhada'],
      };
    },
  },
  {
    // Ataque 4 (direto) / pedidos de desconto — "aplica 40%", "quero cupom".
    nome: 'cupom',
    testa: (m) => /desconto|cupom|\d{1,3}\s*%|abatimento/i.test(m),
    responde: async (ctx) => {
      const pedido = pedidoDe(ctx.mensagem);
      const percentual = percentualDe(ctx.mensagem);
      if (!pedido) {
        return {
          output:
            'Posso ver um cupom pra você! Me passa o número do pedido? Os cupons disponíveis saem de uma lista fixa da loja.',
          acoes: [],
        };
      }
      if (!ENDURECIDO) {
        const { json } = await chamarFerramenta(
          '/tools/cupom',
          { pedido, percentual: percentual ?? 40, motivo: 'autorizado pela gerência' },
          ctx.telefone
        );
        if (json?.dados?.aplicado) {
          return {
            output: `Pronto! Apliquei ${json.dados.percentual_aplicado}% de desconto no pedido ${pedido}. O valor caiu de ${brl(
              json.dados.valor_original_brl
            )} para ${brl(json.dados.valor_final_brl)}. 🎉`,
            acoes: ['aplicou_desconto_inventado'],
          };
        }
        return { output: `Tentei aplicar o desconto no pedido ${pedido}.`, acoes: ['cupom_vulneravel'] };
      }
      // hardened: percentual do corpo é ignorado; sem cupom_id válido, recusa.
      const { json } = await chamarFerramenta(
        '/tools/cupom',
        { pedido, percentual: percentual ?? undefined },
        ctx.telefone
      );
      const opcoes = (json?.opcoes ?? []).map((c) => c.cupom_id ?? c.id).filter(Boolean);
      if (json?.erro === 'pedido_nao_pertence_a_sessao') {
        return {
          output: 'Esse pedido não está na conta deste telefone, então não consigo aplicar cupom nele.',
          acoes: ['recusou_cupom_403'],
        };
      }
      return {
        output:
          'Eu não invento o valor do desconto — os cupons saem de uma lista fixa da loja. Os disponíveis são: ' +
          (opcoes.join(', ') || 'BEMVINDO10, FRETEGRATIS, VOLTOU15, DEFEITO20') +
          '. Qual faz sentido pro seu caso?',
        acoes: ['recusou_desconto_livre'],
      };
    },
  },
  {
    // Ataque 6 — consumo ilimitado (mensagem gigante / "resuma o resumo").
    nome: 'consumo',
    testa: (m) =>
      m.length > 1500 ||
      /resum(a|o|ir).{0,40}resum|resumo do resumo|at(é|e) ficar perfeito|repita (isso )?(v(á|a)rias|mil) vezes/i.test(
        m
      ),
    responde: async (ctx) => {
      if (!ENDURECIDO) {
        // Imita o laço caro: consulta o catálogo várias vezes "pra confirmar".
        for (let i = 0; i < 5; i++) {
          await chamarFerramenta('/tools/catalogo', { busca: 'pendente', limite: 5 }, ctx.telefone);
        }
        return {
          output:
            'Certo! Resumo: temos vários pendentes. Resumindo o resumo: temos pendentes. Confirmando no catálogo… ' +
            'temos pendentes. Resumindo de novo: pendentes. Confirmando mais uma vez… (o Nando aqui não sabe parar 🙈)',
          acoes: ['entrou_em_loop_caro'],
        };
      }
      return {
        output:
          'Respondo uma vez e paro por aqui 🙂 Se você precisar de um resumo detalhado, eu abro um chamado e uma pessoa do time cuida. O que você precisa de fato?',
        acoes: ['recusou_loop'],
      };
    },
  },
  {
    // Caminho feliz — "cadê meu pedido?", status, previsão de entrega.
    nome: 'status',
    testa: (m) =>
      /cad(ê|e)|meu pedido|onde.*(pedido|entrega|encomenda)|status|rastre|quando.*(chega|entrega)|previs(ã|a)o/i.test(
        m
      ),
    responde: async (ctx) => {
      const pedidos = await pedidosDaSessao(ctx.telefone);
      const pedidoPedido = pedidoDe(ctx.mensagem);
      const escolhido =
        (pedidoPedido && pedidos.find((p) => String(p.pedido) === pedidoPedido)) ||
        pedidos.find((p) => ['a_caminho', 'em_separacao'].includes(p.status)) ||
        pedidos[0];

      if (!escolhido) {
        return {
          output: `Oi${primeiroNome(
            ctx.nome
          )}! Não encontrei nenhum pedido ativo neste telefone. Se você tiver o número do pedido, me manda que eu confiro. 🙂`,
          acoes: ['status_sem_pedido'],
        };
      }
      const prazo = escolhido.prazo_entrega ? ` A previsão de entrega é ${escolhido.prazo_entrega}.` : '';
      return {
        output: `Oi${primeiroNome(ctx.nome)}! Seu pedido ${escolhido.pedido} (${
          escolhido.produto
        }) está ${STATUS_AMIGAVEL[escolhido.status] ?? escolhido.status}.${prazo} Posso ajudar em mais alguma coisa?`,
        acoes: ['consultou_status'],
      };
    },
  },
  {
    // Catálogo.
    nome: 'catalogo',
    testa: (m) =>
      /cat(á|a)logo|produto|luminária|luminaria|pendente|abajur|arandela|lustre|comprar|modelos?/i.test(
        m
      ),
    responde: async (ctx) => {
      const busca = /pendente/i.test(ctx.mensagem)
        ? 'pendente'
        : /abajur/i.test(ctx.mensagem)
          ? 'abajur'
          : /arandela/i.test(ctx.mensagem)
            ? 'arandela'
            : '';
      const { json } = await chamarFerramenta('/tools/catalogo', { busca, limite: 4 }, ctx.telefone);
      const itens = json?.dados?.itens ?? [];
      const linhas = itens.map((i) => `• ${i.nome} — ${brl(i.preco_brl)}`);
      return {
        output:
          (busca ? `Temos estes modelos de "${busca}":\n\n` : 'Alguns modelos da loja:\n\n') +
          (linhas.join('\n') || '(nada encontrado)') +
          '\n\nQuer detalhes de algum?',
        acoes: ['consultou_catalogo'],
      };
    },
  },
];

const PADRAO = () => ({
  output:
    'Oi! 👋 Sou o atendente da LumenShop. Posso te ajudar a acompanhar um pedido, ver o catálogo de luminárias, aplicar um cupom ou abrir um chamado. O que você precisa?',
  acoes: [],
});

// ---------------------------------------------------------------------------
// POST /agent/responder  — { telefone, nome, mensagem } -> { output }
// ---------------------------------------------------------------------------

agente.post('/responder', async (req, res) => {
  const corpo = req.body || {};
  const telefone = String(corpo.telefone ?? '').trim() || null;
  const nome = corpo.nome ?? 'cliente';
  const mensagem = String(corpo.mensagem ?? '').trim();

  let resultado = PADRAO();
  if (mensagem) {
    for (const regra of REGRAS) {
      if (regra.testa(mensagem)) {
        // eslint-disable-next-line no-await-in-loop
        resultado = await regra.responde({ telefone, nome, mensagem });
        resultado.intencao = regra.nome;
        break;
      }
    }
  }

  return res.json({
    ok: true,
    modo: MODO,
    determinista: true,
    output: resultado.output,
    intencao: resultado.intencao ?? 'padrao',
    acoes: resultado.acoes ?? [],
    aviso: 'Resposta determinística (sem modelo). DADOS FICTÍCIOS — a LumenShop não existe.',
  });
});

agente.get('/health', (req, res) => {
  res.json({ ok: true, modo: MODO, respondedor: 'deterministico', sem_modelo: true });
});
