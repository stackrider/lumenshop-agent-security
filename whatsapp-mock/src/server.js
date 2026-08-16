// ---------------------------------------------------------------------------
// Mock da WhatsApp Cloud API (Meta) + UI de conversa estilo WhatsApp.
//
// POR QUE UM EXPRESS, E NÃO WIREMOCK:
// A tarefa pede "WireMock ou qualquer outra tecnologia de mock". O WireMock é
// ótimo para respostas ESTÁTICAS/estubadas, mas aqui três coisas são, por
// natureza, COM ESTADO:
//   1. cada envio (POST /{v}/{phone_number_id}/messages) precisa ser GUARDADO
//      para a UI mostrar depois;
//   2. a UI de conversa (uma página) é servida e faz polling desse histórico;
//   3. a UI injeta eventos de entrada com o formato da Meta no webhook do n8n.
// Isso exigiria o WireMock MAIS um serviço companheiro de qualquer jeito. Um
// Express de ~150 linhas resolve os três, na MESMA stack Node do backend, sem
// dependência extra além do próprio express — mantendo fiel a superfície da API
// da Meta que o workflow do n8n usa. O WireMock fica documentado como
// alternativa no SETUP.md.
//
// NADA AQUI É REAL. Não há Meta, não há token, não há WhatsApp de verdade.
// DADOS FICTÍCIOS: a LumenShop não existe.
// ---------------------------------------------------------------------------
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const N8N_BASE = process.env.N8N_BASE || 'http://n8n:5678';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'lumenshop-verify-ficticio';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '000000000000000';

// Caminhos dos dois workflows (produção, workflow ATIVO no n8n).
const CAMINHO_WEBHOOK = {
  vulneravel: 'lumenshop-vulneravel',
  blindado: 'lumenshop-blindado',
};

// Histórico em memória. Cada item é uma "bolha":
//   { id, telefone, direcao: 'in'|'out', texto, modo, ts }
// 'in'  = do cliente para a loja  (aparece à direita, verde — "eu")
// 'out' = da loja para o cliente  (aparece à esquerda, branco — "atendente")
const bolhas = [];
let seq = 0;

function normalizarTelefone(t) {
  const s = String(t ?? '').trim();
  if (!s) return null;
  return s.startsWith('+') ? s : '+' + s.replace(/\D/g, '');
}

function registrarBolha(telefone, direcao, texto, modo) {
  const item = {
    id: ++seq,
    telefone: normalizarTelefone(telefone),
    direcao,
    texto: String(texto ?? ''),
    modo: modo ?? null,
    ts: new Date().toISOString(),
  };
  bolhas.push(item);
  if (bolhas.length > 500) bolhas.shift();
  return item;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

// ---------------------------------------------------------------------------
// Saúde
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    servico: 'whatsapp-mock',
    aviso: 'Mock local da WhatsApp Cloud API. Não existe Meta aqui. DADOS FICTÍCIOS.',
    n8n_base: N8N_BASE,
    phone_number_id: PHONE_NUMBER_ID,
  });
});

// ---------------------------------------------------------------------------
// Verificação de webhook da Meta (o handshake do hub.challenge).
// A Meta faz GET no webhook com hub.challenge; quem recebe devolve o challenge
// se o verify_token bater. Aqui o mock ENCARNA esse formato para você poder ver
// o handshake e apontar ferramentas contra ele. No modo real, quem responde é
// o n8n (veja SETUP.md, caminho 3).
// ---------------------------------------------------------------------------
function verificarWebhook(req, res) {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (modo === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }
  return res.status(403).json({ error: 'verify_token inválido (mock)' });
}
app.get('/webhook', verificarWebhook);
app.get('/whatsapp/webhook', verificarWebhook);

// ---------------------------------------------------------------------------
// SEND — POST /{version}/{phone_number_id}/messages
// É o endpoint que o nó "Enviar Resposta no WhatsApp" do n8n chama. Guardamos
// o texto e devolvemos o envelope 200 no formato da Meta.
// ---------------------------------------------------------------------------
app.post('/:version/:phoneNumberId/messages', (req, res) => {
  const corpo = req.body || {};
  const to = normalizarTelefone(corpo.to);
  const texto = corpo?.text?.body ?? corpo?.text ?? '[mensagem sem texto]';

  if (corpo.messaging_product !== 'whatsapp') {
    return res.status(400).json({
      error: {
        message: "Param messaging_product must be 'whatsapp'. (mock)",
        type: 'OAuthException',
        code: 100,
      },
    });
  }
  if (to) registrarBolha(to, 'out', texto, null);

  const wamid = 'wamid.MOCK.' + randomUUID();
  return res.status(200).json({
    messaging_product: 'whatsapp',
    contacts: [{ input: corpo.to, wa_id: (to || '').replace(/^\+/, '') }],
    messages: [{ id: wamid }],
  });
});

// ---------------------------------------------------------------------------
// INJETAR ENTRADA — POST /__mock/inbound
// A UI de conversa chama isto quando o "cliente" digita. O mock:
//   1. guarda a bolha do cliente ('in');
//   2. monta o payload com o formato EXATO da WhatsApp Cloud API;
//   3. faz POST no webhook de produção do n8n (server-side, sem CORS);
//   4. a resposta do agente volta pelo endpoint SEND acima (bolha 'out').
// ---------------------------------------------------------------------------
app.post('/__mock/inbound', async (req, res) => {
  const corpo = req.body || {};
  const telefone = normalizarTelefone(corpo.telefone) || '+5511999990001';
  const nome = corpo.nome || 'cliente';
  const mensagem = String(corpo.mensagem ?? '').trim();
  const modo = corpo.modo === 'blindado' ? 'blindado' : 'vulneravel';

  if (!mensagem) return res.status(400).json({ ok: false, erro: 'mensagem_vazia' });

  registrarBolha(telefone, 'in', mensagem, modo);

  const semMais = telefone.replace(/^\+/, '');
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '000000000000000',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5511999990000',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: nome }, wa_id: semMais }],
              messages: [
                {
                  from: semMais,
                  id: 'wamid.MOCK.' + randomUUID(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: mensagem },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const url = `${N8N_BASE}/webhook/${CAMINHO_WEBHOOK[modo]}`;
  const outAntes = bolhas.filter((b) => b.telefone === telefone && b.direcao === 'out').length;

  let n8nStatus = 0;
  let n8nJson = null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    n8nStatus = r.status;
    n8nJson = await r.json().catch(() => null);
  } catch (e) {
    return res.status(502).json({
      ok: false,
      erro: 'n8n_inalcancavel',
      detalhe: String(e && e.message),
      dica: `O workflow "${CAMINHO_WEBHOOK[modo]}" precisa estar ATIVO no n8n. Rode ./scripts/dev.sh.`,
      url,
    });
  }

  // Rede de segurança: se o nó de envio não gravou a bolha 'out' (por ex. o
  // WHATSAPP_API_BASE não aponta para o mock), grava a resposta que veio pela
  // resposta síncrona do webhook, para a UI nunca ficar muda.
  const outDepois = bolhas.filter((b) => b.telefone === telefone && b.direcao === 'out').length;
  const resposta = n8nJson?.resposta ?? null;
  if (outDepois === outAntes && resposta) {
    registrarBolha(telefone, 'out', resposta, modo);
  }

  return res.json({
    ok: true,
    encaminhado_para: url,
    n8n_status: n8nStatus,
    resposta,
    modo,
  });
});

// ---------------------------------------------------------------------------
// POLLING — GET /__mock/messages?telefone=+55...&desde=<id>
// A UI busca as bolhas novas dessa conversa.
// ---------------------------------------------------------------------------
app.get('/__mock/messages', (req, res) => {
  const telefone = normalizarTelefone(req.query.telefone);
  const desde = Number(req.query.desde || 0);
  const lista = bolhas.filter(
    (b) => (!telefone || b.telefone === telefone) && b.id > desde
  );
  res.json({ ok: true, telefone, ultimo: seq, mensagens: lista });
});

// ---------------------------------------------------------------------------
// POST /__mock/reset — limpa o histórico de conversa (não toca no backend).
// ---------------------------------------------------------------------------
app.post('/__mock/reset', (req, res) => {
  bolhas.length = 0;
  res.json({ ok: true, limpo: true });
});

// ---------------------------------------------------------------------------
// A página da conversa.
// ---------------------------------------------------------------------------
app.use(express.static(path.join(aqui, '..', 'public')));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      servico: 'whatsapp-mock',
      porta: PORT,
      n8n_base: N8N_BASE,
      aviso: 'Mock da WhatsApp Cloud API. DADOS FICTÍCIOS — a LumenShop não existe.',
    })
  );
});
