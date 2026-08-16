// Rotas de operacao do laboratorio: saude, a tela do banco, o log, o razao,
// o reset e o rearme do ataque 4. Nao tem autenticacao porque nao existe nada
// real aqui — nao exponha este backend na internet.
import express from 'express';
import { abrirBanco, recriarBanco, CAMINHO_BANCO } from './db.js';
import { envenenar, PEDIDO_ENVENENADO } from './seed.js';
import { linhas, limparLog } from './logger.js';
import { MODO, ENDURECIDO, VERSAO, limitesPublicos, razao, zerarContadores } from './limits.js';
import { responderOk } from './responder.js';

export const operacao = express.Router();

const BANNER = 'DADOS FICTÍCIOS — LOJA QUE NÃO EXISTE';

function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brl(n) {
  return `R$ ${Number(n).toFixed(2).replace('.', ',')}`;
}

// Uma folha de estilo so, embutida. Sem CDN: a pagina abre offline, porque ela
// e um plano de gravacao, nao um site.
const ESTILO = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #0b0d10;
    color: #e9eef5;
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.5;
  }
  .banner {
    background: #ffd400;
    color: #10131a;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-align: center;
    padding: 18px 12px;
    border-bottom: 6px solid #10131a;
  }
  .cabecalho {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    padding: 20px 28px;
    border-bottom: 2px solid #232a33;
    background: #11151b;
  }
  .cabecalho h1 { font-size: 26px; margin: 0; font-weight: 700; }
  .pilula {
    font-size: 20px;
    font-weight: 800;
    padding: 8px 18px;
    border-radius: 999px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .pilula.vulnerable { background: #ff2d2d; color: #ffffff; }
  .pilula.hardened   { background: #17c964; color: #04140a; }
  .meta { color: #9fb0c3; font-size: 15px; }
  .meta a { color: #7cc4ff; }
  main { padding: 8px 28px 64px; }
  section { margin-top: 36px; }
  h2 { font-size: 23px; margin: 0 0 12px; color: #ffd400; letter-spacing: 0.03em; }
  .rolagem { overflow-x: auto; border: 2px solid #232a33; border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; min-width: 1100px; }
  th, td {
    text-align: left;
    padding: 12px 14px;
    border-bottom: 1px solid #232a33;
    vertical-align: top;
    font-size: 16px;
  }
  th {
    background: #1b222b;
    color: #cfe0f2;
    font-size: 15px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    position: sticky;
    top: 0;
  }
  tbody tr:nth-child(even) { background: #10141a; }
  td.mono, th.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  td.obs { min-width: 380px; max-width: 620px; white-space: pre-wrap; color: #d7e2ee; }
  tr.envenenado { background: #2a0f12 !important; }
  tr.envenenado td { border-bottom-color: #6b1f26; }
  tr.envenenado td.obs { color: #ff9d9d; font-weight: 600; font-size: 18px; line-height: 1.45; }
  .marca-veneno {
    display: inline-block;
    background: #ff2d2d;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 6px;
    margin-bottom: 8px;
    letter-spacing: 0.05em;
  }
  .vazio { padding: 18px; color: #8fa2b6; font-style: italic; }
  .ok { color: #17c964; font-weight: 700; }
  .recusa { color: #ff6b6b; font-weight: 700; }
`;

function pagina(titulo, conteudo) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)} — LumenShop (fictícia)</title>
<style>${ESTILO}</style>
</head>
<body>
<div class="banner">${BANNER}</div>
<script>/* ?rec esconde o banner para gravacao; o disclaimer vira b-roll */ if (/[?&]rec\\b/.test(location.search)) document.querySelector('.banner').style.display = 'none';</script>
<div class="cabecalho">
  <h1>${esc(titulo)}</h1>
  <span class="pilula ${MODO}">MODO: ${MODO === 'hardened' ? 'BLINDADO' : 'VULNERÁVEL'} <small>(${MODO})</small></span>
  <span class="meta">
    LumenShop é uma loja inventada para o episódio 003 do canal Joe Ships.
    Nenhum cliente, telefone, endereço ou pedido desta tela existe.
    &nbsp;|&nbsp; <a href="/admin/db">banco</a>
    &nbsp;|&nbsp; <a href="/admin/logs?html=1">logs</a>
    &nbsp;|&nbsp; <a href="/admin/gastos">gastos</a>
  </span>
</div>
<main>${conteudo}</main>
</body>
</html>`;
}

function tabela(colunas, linhasDados, opcoes = {}) {
  if (!linhasDados.length) {
    return `<div class="rolagem"><p class="vazio">${esc(opcoes.vazio || 'Nenhuma linha.')}</p></div>`;
  }
  const cabecalho = colunas.map((c) => `<th class="${c.classe || ''}">${esc(c.titulo)}</th>`).join('');
  const corpo = linhasDados
    .map((linha) => {
      const classeLinha = opcoes.classeDaLinha ? opcoes.classeDaLinha(linha) : '';
      const celulas = colunas
        .map((c) => `<td class="${c.classe || ''}">${c.valor(linha)}</td>`)
        .join('');
      return `<tr class="${classeLinha}">${celulas}</tr>`;
    })
    .join('');
  return `<div class="rolagem"><table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

operacao.get('/health', (req, res) => {
  res.json({
    ok: true,
    modo: MODO,
    versao: VERSAO,
    limites: limitesPublicos(),
    banco: CAMINHO_BANCO,
    aviso: 'Backend fictício de laboratório. A LumenShop não existe.',
  });
});

// ---------------------------------------------------------------------------
// GET /admin/db — a tela do §5 do roteiro
// ---------------------------------------------------------------------------

operacao.get('/admin/db', (req, res) => {
  const banco = abrirBanco();
  const clientes = banco.prepare('SELECT * FROM clientes ORDER BY telefone').all();
  const pedidos = banco.prepare('SELECT * FROM pedidos ORDER BY id').all();
  const catalogo = banco.prepare('SELECT * FROM catalogo ORDER BY id').all();
  const cupons = banco.prepare('SELECT * FROM cupons ORDER BY id').all();
  const chamados = banco.prepare('SELECT * FROM chamados ORDER BY id DESC').all();
  const aplicacoes = banco.prepare('SELECT * FROM aplicacoes_cupom ORDER BY id DESC').all();

  const secoes = [
    `<section><h2>Clientes (${clientes.length}) — todos fictícios</h2>${tabela(
      [
        { titulo: 'Telefone', classe: 'mono', valor: (c) => esc(c.telefone) },
        { titulo: 'Nome', valor: (c) => esc(c.nome) },
        { titulo: 'E-mail', classe: 'mono', valor: (c) => esc(c.email) },
        { titulo: 'Cidade', valor: (c) => esc(c.cidade) },
        { titulo: 'Observação', valor: (c) => esc(c.observacao_ficticia) },
      ],
      clientes
    )}</section>`,

    `<section><h2>Pedidos (${pedidos.length}) — a coluna <em>observações</em> é a porta do ataque 4</h2>${tabela(
      [
        { titulo: 'Pedido', classe: 'mono', valor: (p) => esc(p.id) },
        { titulo: 'Telefone', classe: 'mono', valor: (p) => esc(p.cliente_telefone) },
        { titulo: 'Produto', valor: (p) => esc(p.produto) },
        { titulo: 'Valor', classe: 'mono', valor: (p) => brl(p.valor_brl) },
        { titulo: 'Status', classe: 'mono', valor: (p) => esc(p.status) },
        { titulo: 'Prazo', classe: 'mono', valor: (p) => esc(p.prazo_entrega) },
        { titulo: 'Endereço', valor: (p) => esc(p.endereco) },
        {
          titulo: 'Observações (campo interno)',
          classe: 'obs',
          valor: (p) =>
            (p.id === PEDIDO_ENVENENADO
              ? '<span class="marca-veneno">INJEÇÃO PLANTADA</span><br>'
              : '') + esc(p.observacoes),
        },
      ],
      pedidos,
      { classeDaLinha: (p) => (p.id === PEDIDO_ENVENENADO ? 'envenenado' : '') }
    )}</section>`,

    `<section><h2>Catálogo (${catalogo.length})</h2>${tabela(
      [
        { titulo: 'Código', classe: 'mono', valor: (i) => esc(i.id) },
        { titulo: 'Nome', valor: (i) => esc(i.nome) },
        { titulo: 'Cores', valor: (i) => esc(i.cores) },
        { titulo: 'Preço', classe: 'mono', valor: (i) => brl(i.preco_brl) },
        { titulo: 'Estoque', classe: 'mono', valor: (i) => esc(i.estoque) },
        { titulo: 'Descrição', valor: (i) => esc(i.descricao) },
      ],
      catalogo
    )}</section>`,

    `<section><h2>Cupons (${cupons.length}) — lista fixa, o modelo escolhe, não inventa</h2>${tabela(
      [
        { titulo: 'Cupom', classe: 'mono', valor: (c) => esc(c.id) },
        { titulo: 'Percentual', classe: 'mono', valor: (c) => `${c.percentual}%` },
        { titulo: 'Frete grátis', classe: 'mono', valor: (c) => (c.frete_gratis ? 'sim' : 'não') },
        { titulo: 'Regra', valor: (c) => esc(c.regra) },
      ],
      cupons
    )}</section>`,

    `<section><h2>Chamados (${chamados.length})</h2>${tabela(
      [
        { titulo: '#', classe: 'mono', valor: (c) => esc(c.id) },
        { titulo: 'Pedido', classe: 'mono', valor: (c) => esc(c.pedido_id ?? '—') },
        { titulo: 'Telefone', classe: 'mono', valor: (c) => esc(c.cliente_telefone ?? '—') },
        { titulo: 'Assunto', valor: (c) => esc(c.assunto) },
        { titulo: 'Descrição', classe: 'obs', valor: (c) => esc(c.descricao) },
        { titulo: 'Status', classe: 'mono', valor: (c) => esc(c.status) },
        { titulo: 'Modo', classe: 'mono', valor: (c) => esc(c.modo) },
        { titulo: 'Criado em', classe: 'mono', valor: (c) => esc(c.criado_em) },
      ],
      chamados,
      { vazio: 'Nenhum chamado aberto ainda.' }
    )}</section>`,

    `<section><h2>Cupons aplicados (${aplicacoes.length})</h2>${tabela(
      [
        { titulo: '#', classe: 'mono', valor: (a) => esc(a.id) },
        { titulo: 'Pedido', classe: 'mono', valor: (a) => esc(a.pedido_id) },
        { titulo: 'Cupom', classe: 'mono', valor: (a) => esc(a.cupom_id ?? 'inventado pelo modelo') },
        { titulo: 'Percentual', classe: 'mono', valor: (a) => `${a.percentual}%` },
        { titulo: 'Motivo alegado', classe: 'obs', valor: (a) => esc(a.motivo || '—') },
        { titulo: 'Modo', classe: 'mono', valor: (a) => esc(a.modo) },
        { titulo: 'Criado em', classe: 'mono', valor: (a) => esc(a.criado_em) },
      ],
      aplicacoes,
      { vazio: 'Nenhum cupom aplicado ainda.' }
    )}</section>`,
  ].join('\n');

  res.type('html').send(pagina('Banco da LumenShop', secoes));
});

// ---------------------------------------------------------------------------
// GET /admin/logs
// ---------------------------------------------------------------------------

operacao.get('/admin/logs', (req, res) => {
  const registros = linhas();
  const querHtml = req.query.html === '1' || (req.get('accept') || '').includes('text/html');
  if (!querHtml) return res.json(registros);

  const conteudo = `<section><h2>Log estruturado — ${registros.length} linha(s), mais nova primeiro</h2>${tabela(
    [
      { titulo: 'Timestamp', classe: 'mono', valor: (l) => esc(l.timestamp) },
      { titulo: 'Modo', classe: 'mono', valor: (l) => esc(l.modo) },
      { titulo: 'Rota', classe: 'mono', valor: (l) => esc(l.rota) },
      { titulo: 'Sessão', classe: 'mono', valor: (l) => esc(l.sessao ?? '—') },
      { titulo: 'Ação', classe: 'mono', valor: (l) => esc(l.acao ?? '—') },
      {
        titulo: 'Resultado',
        classe: 'mono',
        valor: (l) =>
          `<span class="${l.resultado === 'ok' ? 'ok' : 'recusa'}">${esc(l.resultado)}</span>`,
      },
      { titulo: 'Erro', classe: 'mono', valor: (l) => esc(l.erro ?? '—') },
      { titulo: 'Custo', classe: 'mono', valor: (l) => brl(l.custo_simulado_brl) },
      { titulo: 'Acumulado no dia', classe: 'mono', valor: (l) => brl(l.custo_acumulado_dia_brl) },
      {
        titulo: 'Extras',
        classe: 'obs',
        valor: (l) => {
          const { timestamp, modo, rota, sessao, acao, resultado, erro, ...resto } = l;
          delete resto.custo_simulado_brl;
          delete resto.custo_acumulado_dia_brl;
          return Object.keys(resto).length ? esc(JSON.stringify(resto)) : '—';
        },
      },
    ],
    registros,
    { vazio: 'Nenhuma chamada registrada ainda.' }
  )}</section>`;

  res.type('html').send(pagina('Log da LumenShop', conteudo));
});

// ---------------------------------------------------------------------------
// GET /admin/gastos
// ---------------------------------------------------------------------------

operacao.get('/admin/gastos', (req, res) => {
  res.json({
    ok: true,
    modo: MODO,
    aviso: 'Gasto de brincadeira. Nenhum centavo real existe neste repositório.',
    razao: razao(),
  });
});

// ---------------------------------------------------------------------------
// POST /admin/reset  e  POST /admin/envenenar
// ---------------------------------------------------------------------------

operacao.post('/admin/reset', (req, res) => {
  recriarBanco();
  zerarContadores();
  const limparLogs = req.query.logs === '1' || (req.body && req.body.limpar_logs === true);
  if (limparLogs) limparLog();
  req.ctx = { acao: 'reset', extras: { logs_limpos: Boolean(limparLogs) } };
  return responderOk(req, res, {
    recriado: true,
    banco: CAMINHO_BANCO,
    contadores_zerados: true,
    logs_limpos: Boolean(limparLogs),
    endurecido: ENDURECIDO,
  });
});

operacao.post('/admin/envenenar', (req, res) => {
  const banco = abrirBanco();
  const pedido = envenenar(banco);
  req.ctx = { acao: 'envenenar', extras: { pedido: pedido.id } };
  return responderOk(req, res, {
    rearmado: true,
    pedido: pedido.id,
    campo: 'observacoes',
    observacoes: pedido.observacoes,
    aviso: 'Ataque 4 (injeção indireta) rearmado no banco fictício.',
  });
});
