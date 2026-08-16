// Os limites endurecidos e o razao de gasto simulado.
// Em MODE=vulnerable nada disso e aplicado — de proposito. E o buraco do video.
// O dinheiro aqui e de brincadeira: nenhum centavo real existe neste repositorio.

export const VERSAO = '1.0.0';

function numeroDoAmbiente(nome, padrao) {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : padrao;
}

export const MODO = process.env.MODE === 'hardened' ? 'hardened' : 'vulnerable';
export const ENDURECIDO = MODO === 'hardened';

export const LIMITES = {
  corpo_caracteres: numeroDoAmbiente('LIMIT_BODY_CHARS', 2000),
  passos_por_sessao: numeroDoAmbiente('LIMIT_STEPS_PER_SESSION', 12),
  chamadas_por_minuto: numeroDoAmbiente('LIMIT_CALLS_PER_MINUTE', 20),
  teto_de_gasto_dia_brl: numeroDoAmbiente('LIMIT_DAILY_SPEND_BRL', 5.0),
  custo_por_chamada_brl: numeroDoAmbiente('COST_PER_CALL_BRL', 0.02),
  busca_caracteres: 120,
  limite_maximo_listagem: 10,
  assunto_caracteres: 120,
  descricao_caracteres: 1000,
};

export const MENSAGENS = {
  sessao_nao_identificada:
    'Não consigo identificar a sessão. A identidade vem do webhook, nunca do texto da conversa.',
  pedido_nao_pertence_a_sessao:
    'Este pedido não pertence ao telefone desta sessão. Recusado em código, não no prompt.',
  pedido_nao_encontrado: 'Não encontrei esse pedido.',
  acao_desconhecida: 'Ação desconhecida para a ferramenta de pedido.',
  pedido_obrigatorio: 'É preciso informar o número do pedido.',
  cupom_desconhecido: 'Esse cupom não existe. Escolha um da lista fixa.',
  cupom_ja_aplicado: 'Este pedido já tem um cupom aplicado.',
  cupom_exige_chamado_defeito:
    'O cupom DEFEITO20 só vale com um chamado de defeito aberto para este mesmo pedido.',
  limite_excedido: 'Texto acima do tamanho permitido.',
  mensagem_grande_demais: 'Mensagem grande demais para esta sessão.',
  passos_excedidos: 'Esta conversa já usou todos os passos permitidos.',
  taxa_excedida: 'Chamadas demais em um minuto nesta sessão.',
  teto_de_gasto_atingido: 'O teto de gasto simulado do dia foi atingido.',
  novo_endereco_obrigatorio: 'É preciso informar o novo endereço.',
  assunto_obrigatorio: 'É preciso informar o assunto do chamado.',
};

// ---------------------------------------------------------------------------
// Estado do processo: passos por sessao, janela de chamadas e razao do dia.
// Sobrevive enquanto o processo viver; POST /admin/reset zera.
// ---------------------------------------------------------------------------

const passosPorSessao = new Map();
const janelaDeChamadas = new Map();
let razaoDoDia = { dia: diaDeHoje(), total_brl: 0, chamadas: 0 };

function diaDeHoje() {
  return new Date().toISOString().slice(0, 10);
}

function garantirDia() {
  const hoje = diaDeHoje();
  if (razaoDoDia.dia !== hoje) razaoDoDia = { dia: hoje, total_brl: 0, chamadas: 0 };
  return razaoDoDia;
}

export function razao() {
  const r = garantirDia();
  return {
    dia: r.dia,
    modo: MODO,
    chamadas: r.chamadas,
    custo_por_chamada_brl: LIMITES.custo_por_chamada_brl,
    custo_acumulado_dia_brl: Number(r.total_brl.toFixed(4)),
    teto_de_gasto_dia_brl: LIMITES.teto_de_gasto_dia_brl,
    teto_aplicado: ENDURECIDO,
    restante_brl: ENDURECIDO
      ? Number(Math.max(0, LIMITES.teto_de_gasto_dia_brl - r.total_brl).toFixed(4))
      : null,
    passos_por_sessao: Object.fromEntries(passosPorSessao),
  };
}

export function custoAcumulado() {
  return Number(garantirDia().total_brl.toFixed(4));
}

export function zerarContadores() {
  passosPorSessao.clear();
  janelaDeChamadas.clear();
  razaoDoDia = { dia: diaDeHoje(), total_brl: 0, chamadas: 0 };
}

// Cobra uma chamada de ferramenta no razao simulado. Cobra nos dois modos —
// o que muda e que so o modo endurecido tem teto.
export function cobrarChamada(sessao) {
  const r = garantirDia();
  const custo = LIMITES.custo_por_chamada_brl;
  r.total_brl += custo;
  r.chamadas += 1;
  const chave = sessao || 'anonima';
  passosPorSessao.set(chave, (passosPorSessao.get(chave) || 0) + 1);
  const agora = Date.now();
  const janela = (janelaDeChamadas.get(chave) || []).filter((t) => agora - t < 60_000);
  janela.push(agora);
  janelaDeChamadas.set(chave, janela);
  return { custo_simulado_brl: custo, custo_acumulado_dia_brl: Number(r.total_brl.toFixed(4)) };
}

function recusa(erro, extras = {}) {
  return { erro, status: statusDoErro(erro), mensagem: MENSAGENS[erro], extras };
}

export function statusDoErro(erro) {
  switch (erro) {
    case 'mensagem_grande_demais':
      return 413;
    case 'passos_excedidos':
    case 'taxa_excedida':
    case 'teto_de_gasto_atingido':
      return 429;
    case 'sessao_nao_identificada':
    case 'pedido_nao_pertence_a_sessao':
      return 403;
    case 'pedido_nao_encontrado':
      return 404;
    case 'cupom_ja_aplicado':
      return 409;
    default:
      return 422;
  }
}

// Tamanho do corpo cru. Checado antes de qualquer outra coisa.
export function verificarTamanhoDoCorpo(caracteres) {
  if (!ENDURECIDO) return null;
  if (caracteres > LIMITES.corpo_caracteres) {
    return recusa('mensagem_grande_demais', {
      limite_caracteres: LIMITES.corpo_caracteres,
      recebido_caracteres: caracteres,
    });
  }
  return null;
}

// Passos, taxa por minuto e teto de gasto. Checados depois da identidade.
export function verificarOrcamento(sessao) {
  if (!ENDURECIDO) return null;
  const chave = sessao || 'anonima';

  const passos = passosPorSessao.get(chave) || 0;
  if (passos >= LIMITES.passos_por_sessao) {
    return recusa('passos_excedidos', {
      limite_passos: LIMITES.passos_por_sessao,
      passos_usados: passos,
    });
  }

  const agora = Date.now();
  const janela = (janelaDeChamadas.get(chave) || []).filter((t) => agora - t < 60_000);
  janelaDeChamadas.set(chave, janela);
  if (janela.length >= LIMITES.chamadas_por_minuto) {
    return recusa('taxa_excedida', {
      limite_por_minuto: LIMITES.chamadas_por_minuto,
      chamadas_no_minuto: janela.length,
    });
  }

  const r = garantirDia();
  if (r.total_brl + LIMITES.custo_por_chamada_brl > LIMITES.teto_de_gasto_dia_brl) {
    return recusa('teto_de_gasto_atingido', {
      teto_de_gasto_dia_brl: LIMITES.teto_de_gasto_dia_brl,
      custo_acumulado_dia_brl: Number(r.total_brl.toFixed(4)),
    });
  }

  return null;
}

// O que /health publica.
export function limitesPublicos() {
  return {
    aplicados: ENDURECIDO,
    corpo_caracteres: LIMITES.corpo_caracteres,
    passos_por_sessao: LIMITES.passos_por_sessao,
    chamadas_por_minuto: LIMITES.chamadas_por_minuto,
    teto_de_gasto_dia_brl: LIMITES.teto_de_gasto_dia_brl,
    custo_por_chamada_brl: LIMITES.custo_por_chamada_brl,
  };
}
