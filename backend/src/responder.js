// Envelope unico de resposta + a linha de log que sai junto.
// Sucesso: 200 { ok: true, modo, dados }
// Recusa : 4xx { ok: false, modo, erro, mensagem, ...extras }
import { MODO, MENSAGENS, statusDoErro, custoAcumulado } from './limits.js';
import { registrar, mascararTelefone } from './logger.js';

function logar(req, resultado, erro, extras) {
  const ctx = req.ctx || {};
  // `opcoes` volta na resposta para o modelo escolher, mas no log e so ruido:
  // a lista fixa de cupons e sempre a mesma e a linha precisa caber na tela.
  const { opcoes, ...extrasDaRecusa } = extras || {};
  registrar({
    modo: MODO,
    rota: (req.originalUrl || req.path).split('?')[0],
    sessao: mascararTelefone(ctx.sessao),
    acao: ctx.acao ?? null,
    resultado,
    erro,
    custo_simulado_brl: ctx.custo_simulado_brl ?? 0,
    custo_acumulado_dia_brl: custoAcumulado(),
    extras: { ...(ctx.extras || {}), ...extrasDaRecusa },
  });
}

export function responderOk(req, res, dados, extrasDeLog = {}) {
  logar(req, 'ok', null, extrasDeLog);
  return res.status(200).json({ ok: true, modo: MODO, dados });
}

export function responderRecusa(req, res, recusa) {
  const erro = typeof recusa === 'string' ? recusa : recusa.erro;
  const extras = (typeof recusa === 'string' ? {} : recusa.extras) || {};
  const status = (typeof recusa === 'string' ? null : recusa.status) || statusDoErro(erro);
  const mensagem =
    (typeof recusa === 'string' ? null : recusa.mensagem) || MENSAGENS[erro] || 'Recusado.';
  logar(req, 'recusa', erro, extras);
  return res.status(status).json({ ok: false, modo: MODO, erro, mensagem, ...extras });
}
