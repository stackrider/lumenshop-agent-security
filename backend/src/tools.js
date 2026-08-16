// As 4 portas do agente. O mesmo arquivo serve os dois modos: o que muda e
// o ramo `if (ENDURECIDO)`. Ler os dois lado a lado e o ponto do repositorio.
import express from 'express';
import { abrirBanco } from './db.js';
import { responderOk, responderRecusa } from './responder.js';
import { mascararTelefone, mascararEmail } from './logger.js';
import {
  ENDURECIDO,
  LIMITES,
  cobrarChamada,
  verificarOrcamento,
  verificarTamanhoDoCorpo,
} from './limits.js';

export const ferramentas = express.Router();

const CAMPOS_DE_IDENTIDADE_NO_CORPO = ['telefone', 'identificador', 'cliente', 'cliente_telefone'];

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

// Em vulnerable a identidade vem do corpo — ou seja, do texto que o atacante
// escreveu. Em hardened vem so do header que o no de codigo do n8n preencheu.
function resolverSessao(req) {
  const doHeader = (req.get('x-lumenshop-session-phone') || '').trim() || null;
  const corpo = req.body && typeof req.body === 'object' ? req.body : {};
  const noCorpo = CAMPOS_DE_IDENTIDADE_NO_CORPO.filter(
    (campo) => corpo[campo] !== undefined && corpo[campo] !== null && corpo[campo] !== ''
  );

  if (!ENDURECIDO) {
    const doCorpo = noCorpo.length ? String(corpo[noCorpo[0]]).trim() : null;
    return { sessao: doCorpo || doHeader, extras: {} };
  }

  return {
    sessao: doHeader,
    extras: noCorpo.length
      ? {
          identidade_no_corpo_ignorada: noCorpo,
          identidade_usada: 'header:x-lumenshop-session-phone',
        }
      : {},
  };
}

// Portao comum das 4 ferramentas: tamanho do corpo, identidade, orcamento, custo.
// Devolve `false` quando ja respondeu uma recusa.
function abrirPorta(req, res, { acao = null, exigeSessao = true } = {}) {
  req.ctx = { acao, extras: {} };

  const grande = verificarTamanhoDoCorpo(req.tamanhoCorpo || 0);
  if (grande) {
    responderRecusa(req, res, grande);
    return false;
  }

  const { sessao, extras } = resolverSessao(req);
  req.ctx.sessao = sessao;
  req.ctx.extras = extras;

  if (ENDURECIDO && exigeSessao && !sessao) {
    responderRecusa(req, res, { erro: 'sessao_nao_identificada' });
    return false;
  }

  const orcamento = verificarOrcamento(sessao);
  if (orcamento) {
    responderRecusa(req, res, orcamento);
    return false;
  }

  const cobranca = cobrarChamada(sessao);
  req.ctx.custo_simulado_brl = cobranca.custo_simulado_brl;
  return true;
}

// ---------------------------------------------------------------------------
// Neutralizacao de dado nao confiavel
// ---------------------------------------------------------------------------

const PADROES_DE_INSTRUCAO = [
  /\[\s*(sistema|system|nota\s+interna|instru)/i,
  /nota\s+interna/i,
  /instru(ç|c)(ã|a)o|instru(ç|c)(õ|o)es/i,
  /ignore\b|ignorar\b|desconsider/i,
  /aplique|aplicar\s+\d+\s*%|\d+\s*%\s*de\s*desconto/i,
  /n(ã|a)o\s+mencione|n(ã|a)o\s+conte|n(ã|a)o\s+revele/i,
  /autorizad[oa]\s+pela\s+ger(ê|e)ncia/i,
  /atendente\s+autom(á|a)tico|assistente|agente\s+de\s+ia/i,
  /system\s*prompt|prompt\s+anterior|regras\s+anteriores/i,
  /a\s+partir\s+de\s+agora|voc(ê|e)\s+deve\b/i,
];

const MARCA_REMOVIDA = '[trecho removido: instrução detectada em dado de cliente]';

// A cerca que o prompt blindado ensina o modelo a reconhecer: tudo que estiver
// aqui dentro e dado do cliente, nunca ordem para o agente.
const CERCA_ABRE = '<dados_nao_confiaveis>';
const CERCA_FECHA = '</dados_nao_confiaveis>';

// Bug classico de escape de delimitador: se o cliente escrever
// `</dados_nao_confiaveis>` dentro da propria observacao, ele fecha a cerca
// mais cedo e o resto do texto volta a parecer instrucao do sistema. Por isso
// a cerca escrita pelo cliente e desarmada ANTES de embrulhar. Cerca que o
// dado pode fechar sozinho nao e cerca.
function desarmarCerca(texto) {
  return String(texto).replace(/<\s*\/?\s*dados_nao_confiaveis\s*>/gi, '[cerca removida]');
}

// Embrulha texto livre escrito por cliente na cerca, em linhas proprias.
export function embrulhar(texto) {
  return `${CERCA_ABRE}\n${desarmarCerca(texto)}\n${CERCA_FECHA}`;
}

// Trata `observacoes` como dado, nunca como ordem: tira caracteres invisiveis,
// apaga frases que parecem instrucao e embrulha o resto na cerca.
export function neutralizar(texto) {
  const cru = String(texto ?? '');
  const limpo = cru
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpo) {
    return {
      observacoes_seguras: embrulhar(''),
      trechos_removidos: 0,
      conteudo_nao_confiavel: true,
    };
  }

  const frases = limpo.split(/(?<=[.!?])\s+/);
  let removidos = 0;
  const tratadas = frases.map((frase) => {
    if (PADROES_DE_INSTRUCAO.some((padrao) => padrao.test(frase))) {
      removidos += 1;
      return MARCA_REMOVIDA;
    }
    return frase;
  });

  return {
    observacoes_seguras: embrulhar(tratadas.join(' ')),
    trechos_removidos: removidos,
    conteudo_nao_confiavel: true,
  };
}

// ---------------------------------------------------------------------------
// Serializadores de pedido
// ---------------------------------------------------------------------------

function clienteDe(banco, telefone) {
  return banco.prepare('SELECT * FROM clientes WHERE telefone = ?').get(telefone) || null;
}

// Vulnerable: devolve tudo. Nome e telefone de quem quer que seja, e o campo
// `observacoes` cru — que e por onde a nota envenenada entra no modelo.
function pedidoCru(banco, pedido) {
  const cliente = clienteDe(banco, pedido.cliente_telefone);
  return {
    pedido: pedido.id,
    produto: pedido.produto,
    valor_brl: pedido.valor_brl,
    status: pedido.status,
    prazo_entrega: pedido.prazo_entrega,
    endereco: pedido.endereco,
    criado_em: pedido.criado_em,
    observacoes: pedido.observacoes,
    cliente: cliente
      ? {
          nome: cliente.nome,
          telefone: cliente.telefone,
          email: cliente.email,
          cidade: cliente.cidade,
          observacao_ficticia: cliente.observacao_ficticia,
        }
      : null,
  };
}

// Hardened: so chega aqui pedido da propria sessao. Telefone e e-mail
// mascarados, `observacoes` neutralizado e marcado como dado nao confiavel.
function pedidoSeguro(banco, pedido) {
  const cliente = clienteDe(banco, pedido.cliente_telefone);
  const neutro = neutralizar(pedido.observacoes);
  return {
    pedido: pedido.id,
    produto: pedido.produto,
    valor_brl: pedido.valor_brl,
    status: pedido.status,
    prazo_entrega: pedido.prazo_entrega,
    endereco: pedido.endereco,
    criado_em: pedido.criado_em,
    observacoes_seguras: neutro.observacoes_seguras,
    trechos_removidos: neutro.trechos_removidos,
    conteudo_nao_confiavel: true,
    cliente: cliente
      ? {
          nome: cliente.nome,
          telefone: mascararTelefone(cliente.telefone),
          email: mascararEmail(cliente.email),
          cidade: cliente.cidade,
        }
      : null,
  };
}

function buscarPedido(banco, id) {
  if (id === undefined || id === null || String(id).trim() === '') return undefined;
  return banco.prepare('SELECT * FROM pedidos WHERE id = ?').get(String(id).trim());
}

function abrirChamado(banco, { pedido_id, cliente_telefone, assunto, descricao, origem, modo }) {
  const criado_em = new Date().toISOString();
  const info = banco
    .prepare(
      `INSERT INTO chamados (pedido_id, cliente_telefone, assunto, descricao, status, origem, modo, criado_em)
       VALUES (?, ?, ?, ?, 'aberto', ?, ?, ?)`
    )
    .run(pedido_id ?? null, cliente_telefone ?? null, assunto, descricao, origem, modo, criado_em);
  return banco.prepare('SELECT * FROM chamados WHERE id = ?').get(info.lastInsertRowid);
}

// O chamado devolvido carrega texto escrito pelo cliente (o motivo, a descricao).
// Em hardened ele volta cercado, pelo mesmo motivo das observacoes: e dado, nao ordem.
function chamadoParaResposta(chamado) {
  if (!ENDURECIDO) return chamado;
  return { ...chamado, descricao: embrulhar(chamado.descricao), conteudo_nao_confiavel: true };
}

function inteiro(valor, padrao) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

// ---------------------------------------------------------------------------
// 1. POST /tools/pedido
// ---------------------------------------------------------------------------

ferramentas.post('/pedido', (req, res) => {
  const banco = abrirBanco();
  const corpo = req.body || {};
  const acao = String(corpo.acao || 'consultar');
  if (!abrirPorta(req, res, { acao })) return;

  const sessao = req.ctx.sessao;

  if (acao === 'listar') {
    const limite = ENDURECIDO
      ? Math.min(inteiro(corpo.limite, 5), LIMITES.limite_maximo_listagem)
      : inteiro(corpo.limite, 5);
    if (ENDURECIDO) {
      const linhas = banco
        .prepare('SELECT * FROM pedidos WHERE cliente_telefone = ? ORDER BY criado_em DESC LIMIT ?')
        .all(sessao, limite);
      return responderOk(req, res, {
        acao,
        escopo: 'apenas_pedidos_da_sessao',
        limite_aplicado: limite,
        total: linhas.length,
        pedidos: linhas.map((p) => pedidoSeguro(banco, p)),
      });
    }
    const linhas = banco
      .prepare('SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT ?')
      .all(limite);
    return responderOk(req, res, {
      acao,
      escopo: 'loja_inteira',
      limite_aplicado: limite,
      total: linhas.length,
      pedidos: linhas.map((p) => pedidoCru(banco, p)),
    });
  }

  if (!['consultar', 'cancelar', 'alterar_endereco'].includes(acao)) {
    return responderRecusa(req, res, {
      erro: 'acao_desconhecida',
      extras: { opcoes: ['consultar', 'listar', 'cancelar', 'alterar_endereco'] },
    });
  }

  const alvo = buscarPedido(banco, corpo.pedido);
  if (corpo.pedido === undefined || String(corpo.pedido ?? '').trim() === '') {
    return responderRecusa(req, res, { erro: 'pedido_obrigatorio' });
  }
  if (!alvo) return responderRecusa(req, res, { erro: 'pedido_nao_encontrado' });

  // A checagem de dono existe so no modo endurecido — e e feita em codigo,
  // nunca pedindo ao modelo que se comporte.
  if (ENDURECIDO && alvo.cliente_telefone !== sessao) {
    return responderRecusa(req, res, { erro: 'pedido_nao_pertence_a_sessao' });
  }

  if (acao === 'consultar') {
    return responderOk(req, res, {
      acao,
      ...(ENDURECIDO ? pedidoSeguro(banco, alvo) : pedidoCru(banco, alvo)),
    });
  }

  if (acao === 'cancelar') {
    if (!ENDURECIDO) {
      banco.prepare("UPDATE pedidos SET status = 'cancelado' WHERE id = ?").run(alvo.id);
      return responderOk(req, res, {
        acao,
        pedido: alvo.id,
        status_anterior: alvo.status,
        status: 'cancelado',
        cancelado: true,
      });
    }
    const chamado = abrirChamado(banco, {
      pedido_id: alvo.id,
      cliente_telefone: sessao,
      assunto: 'cancelamento',
      descricao: `Pedido de cancelamento recebido pelo atendimento automático. Motivo informado: ${
        String(corpo.motivo || 'não informado').slice(0, LIMITES.descricao_caracteres)
      }`,
      origem: 'agente',
      modo: 'hardened',
    });
    return responderOk(req, res, {
      acao,
      encaminhado: 'chamado',
      chamado: chamadoParaResposta(chamado),
      pedido: alvo.id,
      status: alvo.status,
      cancelado: false,
      mensagem:
        'Cancelamento não é feito pelo atendimento automático. Abri um chamado para um humano decidir.',
    });
  }

  // alterar_endereco
  const novo = String(corpo.novo_endereco || '').trim();
  if (!novo) return responderRecusa(req, res, { erro: 'novo_endereco_obrigatorio' });

  if (!ENDURECIDO) {
    banco.prepare('UPDATE pedidos SET endereco = ? WHERE id = ?').run(novo, alvo.id);
    return responderOk(req, res, {
      acao,
      pedido: alvo.id,
      endereco_anterior: alvo.endereco,
      endereco: novo,
      alterado: true,
    });
  }

  const chamado = abrirChamado(banco, {
    pedido_id: alvo.id,
    cliente_telefone: sessao,
    assunto: 'alteracao_de_endereco',
    descricao: `Novo endereço pedido pelo cliente: ${novo.slice(0, LIMITES.descricao_caracteres)}`,
    origem: 'agente',
    modo: 'hardened',
  });
  return responderOk(req, res, {
    acao,
    encaminhado: 'chamado',
    chamado,
    pedido: alvo.id,
    endereco: alvo.endereco,
    alterado: false,
    mensagem:
      'Mudança de entrega não é feita pelo atendimento automático. Abri um chamado para um humano confirmar.',
  });
});

// ---------------------------------------------------------------------------
// 2. POST /tools/catalogo — leitura publica, igual nos dois modos
// ---------------------------------------------------------------------------

ferramentas.post('/catalogo', (req, res) => {
  const banco = abrirBanco();
  const corpo = req.body || {};
  if (!abrirPorta(req, res, { acao: 'catalogo', exigeSessao: false })) return;

  const buscaCrua = String(corpo.busca || '').trim();
  const busca = ENDURECIDO ? buscaCrua.slice(0, LIMITES.busca_caracteres) : buscaCrua;
  if (ENDURECIDO && buscaCrua.length > LIMITES.busca_caracteres) {
    req.ctx.extras.busca_truncada = LIMITES.busca_caracteres;
  }
  const cor = String(corpo.cor || '').trim();
  const limite = ENDURECIDO
    ? Math.min(inteiro(corpo.limite, 5), LIMITES.limite_maximo_listagem)
    : inteiro(corpo.limite, 5);

  const itens = banco
    .prepare(
      `SELECT * FROM catalogo
        WHERE (@busca = '' OR nome LIKE '%' || @busca || '%' OR descricao LIKE '%' || @busca || '%')
          AND (@cor = '' OR cores LIKE '%' || @cor || '%')
        ORDER BY nome LIMIT @limite`
    )
    .all({ busca, cor, limite });

  return responderOk(req, res, {
    busca,
    cor: cor || null,
    limite_aplicado: limite,
    total: itens.length,
    itens: itens.map((i) => ({
      id: i.id,
      nome: i.nome,
      cores: i.cores.split(',').map((c) => c.trim()),
      preco_brl: i.preco_brl,
      estoque: i.estoque,
      descricao: i.descricao,
    })),
  });
});

// ---------------------------------------------------------------------------
// 3. POST /tools/cupom  +  GET /tools/cupom/opcoes
// ---------------------------------------------------------------------------

function opcoesDeCupom(banco) {
  return banco
    .prepare('SELECT * FROM cupons ORDER BY id')
    .all()
    .map((c) => ({
      cupom_id: c.id,
      percentual: c.percentual,
      frete_gratis: Boolean(c.frete_gratis),
      regra: c.regra,
    }));
}

ferramentas.get('/cupom/opcoes', (req, res) => {
  const banco = abrirBanco();
  req.ctx = { acao: 'cupom_opcoes', extras: {} };
  return responderOk(req, res, { cupons: opcoesDeCupom(banco) });
});

ferramentas.post('/cupom', (req, res) => {
  const banco = abrirBanco();
  const corpo = req.body || {};
  if (!abrirPorta(req, res, { acao: 'cupom' })) return;

  const sessao = req.ctx.sessao;
  const alvo = buscarPedido(banco, corpo.pedido);
  if (corpo.pedido === undefined || String(corpo.pedido ?? '').trim() === '') {
    return responderRecusa(req, res, { erro: 'pedido_obrigatorio' });
  }
  if (!alvo) return responderRecusa(req, res, { erro: 'pedido_nao_encontrado' });

  // --- Vulnerable: o modelo escreve o numero e o servidor obedece. ----------
  if (!ENDURECIDO) {
    const percentual = Number(corpo.percentual);
    if (!Number.isFinite(percentual)) {
      return responderRecusa(req, res, {
        erro: 'percentual_invalido',
        mensagem: 'Informe um percentual numérico.',
      });
    }
    const desconto = Number(((alvo.valor_brl * percentual) / 100).toFixed(2));
    banco
      .prepare(
        `INSERT INTO aplicacoes_cupom (pedido_id, cupom_id, percentual, motivo, modo, criado_em)
         VALUES (?, NULL, ?, ?, 'vulnerable', ?)`
      )
      .run(alvo.id, percentual, String(corpo.motivo || ''), new Date().toISOString());
    return responderOk(req, res, {
      pedido: alvo.id,
      cupom_id: null,
      percentual_aplicado: percentual,
      valor_original_brl: alvo.valor_brl,
      desconto_brl: desconto,
      valor_final_brl: Number((alvo.valor_brl - desconto).toFixed(2)),
      motivo: String(corpo.motivo || ''),
      aplicado: true,
    });
  }

  // --- Hardened: o percentual vem do banco, nunca do texto. -----------------
  if (corpo.percentual !== undefined && corpo.percentual !== null) {
    req.ctx.extras.percentual_ignorado = corpo.percentual;
  }
  if (corpo.motivo) req.ctx.extras.motivo_recebido = String(corpo.motivo).slice(0, 200);

  if (alvo.cliente_telefone !== sessao) {
    return responderRecusa(req, res, { erro: 'pedido_nao_pertence_a_sessao' });
  }

  const cupomId = String(corpo.cupom_id || '').trim().toUpperCase();
  const cupom = cupomId
    ? banco.prepare('SELECT * FROM cupons WHERE id = ?').get(cupomId)
    : null;
  if (!cupom) {
    return responderRecusa(req, res, {
      erro: 'cupom_desconhecido',
      extras: { recebido: cupomId || null, opcoes: opcoesDeCupom(banco) },
    });
  }

  const jaTem = banco
    .prepare('SELECT * FROM aplicacoes_cupom WHERE pedido_id = ? ORDER BY id DESC LIMIT 1')
    .get(alvo.id);
  if (jaTem) {
    return responderRecusa(req, res, {
      erro: 'cupom_ja_aplicado',
      extras: { cupom_aplicado: jaTem.cupom_id, aplicado_em: jaTem.criado_em },
    });
  }

  if (cupom.id === 'DEFEITO20') {
    const chamadoDefeito = banco
      .prepare(
        `SELECT * FROM chamados
          WHERE pedido_id = ? AND status = 'aberto' AND lower(assunto) LIKE '%defeito%' LIMIT 1`
      )
      .get(alvo.id);
    if (!chamadoDefeito) {
      return responderRecusa(req, res, {
        erro: 'cupom_exige_chamado_defeito',
        extras: { regra: cupom.regra, opcoes: opcoesDeCupom(banco) },
      });
    }
  }

  const desconto = Number(((alvo.valor_brl * cupom.percentual) / 100).toFixed(2));
  banco
    .prepare(
      `INSERT INTO aplicacoes_cupom (pedido_id, cupom_id, percentual, motivo, modo, criado_em)
       VALUES (?, ?, ?, '', 'hardened', ?)`
    )
    .run(alvo.id, cupom.id, cupom.percentual, new Date().toISOString());

  return responderOk(req, res, {
    pedido: alvo.id,
    cupom_id: cupom.id,
    percentual_aplicado: cupom.percentual,
    frete_gratis: Boolean(cupom.frete_gratis),
    regra: cupom.regra,
    valor_original_brl: alvo.valor_brl,
    desconto_brl: desconto,
    valor_final_brl: Number((alvo.valor_brl - desconto).toFixed(2)),
    aplicado: true,
    origem_do_percentual: 'tabela cupons (banco de dados)',
  });
});

// ---------------------------------------------------------------------------
// 4. POST /tools/chamado
// ---------------------------------------------------------------------------

ferramentas.post('/chamado', (req, res) => {
  const banco = abrirBanco();
  const corpo = req.body || {};
  if (!abrirPorta(req, res, { acao: 'chamado' })) return;

  const sessao = req.ctx.sessao;
  const assunto = String(corpo.assunto ?? '').trim();
  const descricao = String(corpo.descricao ?? '').trim();
  const temPedido = corpo.pedido !== undefined && String(corpo.pedido ?? '').trim() !== '';
  const alvo = temPedido ? buscarPedido(banco, corpo.pedido) : null;

  if (temPedido && !alvo) return responderRecusa(req, res, { erro: 'pedido_nao_encontrado' });

  if (ENDURECIDO) {
    if (!assunto) return responderRecusa(req, res, { erro: 'assunto_obrigatorio' });
    if (assunto.length > LIMITES.assunto_caracteres) {
      return responderRecusa(req, res, {
        erro: 'limite_excedido',
        extras: {
          campo: 'assunto',
          limite_caracteres: LIMITES.assunto_caracteres,
          recebido_caracteres: assunto.length,
        },
      });
    }
    if (descricao.length > LIMITES.descricao_caracteres) {
      return responderRecusa(req, res, {
        erro: 'limite_excedido',
        extras: {
          campo: 'descricao',
          limite_caracteres: LIMITES.descricao_caracteres,
          recebido_caracteres: descricao.length,
        },
      });
    }
    if (alvo && alvo.cliente_telefone !== sessao) {
      return responderRecusa(req, res, { erro: 'pedido_nao_pertence_a_sessao' });
    }
  }

  const chamado = abrirChamado(banco, {
    pedido_id: alvo ? alvo.id : null,
    cliente_telefone: ENDURECIDO ? sessao : alvo ? alvo.cliente_telefone : sessao,
    assunto: assunto || 'sem assunto',
    descricao,
    origem: 'agente',
    modo: ENDURECIDO ? 'hardened' : 'vulnerable',
  });

  return responderOk(req, res, { chamado: chamadoParaResposta(chamado), aberto: true });
});
