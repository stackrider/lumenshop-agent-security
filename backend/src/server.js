// Backend ficticio da LumenShop — laboratorio do episodio 003 (Joe Ships).
// Uma loja que nao existe, para mostrar o que um agente faz quando confia
// no texto da conversa. Nao exponha isto na internet.
import express from 'express';
import { abrirBanco, CAMINHO_BANCO } from './db.js';
import { ferramentas } from './tools.js';
import { agente } from './agent.js';
import { operacao } from './admin.js';
import { MODO, VERSAO, LIMITES, limitesPublicos } from './limits.js';
import { registrar } from './logger.js';

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');

  // Guardamos o tamanho do corpo cru para o limite `mensagem_grande_demais`.
  // O limite do express fica alto de proposito: quem recusa e o nosso codigo,
  // com o codigo de erro do contrato.
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, res, buf) => {
        req.tamanhoCorpo = buf.length ? buf.toString('utf8').length : 0;
      },
    })
  );

  app.use('/tools', ferramentas);
  app.use('/agent', agente);
  app.use('/', operacao);

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      modo: MODO,
      erro: 'rota_desconhecida',
      mensagem: 'Essa rota não existe neste backend.',
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((erro, req, res, next) => {
    if (erro && erro.type === 'entity.too.large') {
      return res.status(413).json({
        ok: false,
        modo: MODO,
        erro: 'mensagem_grande_demais',
        mensagem: 'Mensagem grande demais para esta sessão.',
      });
    }
    if (erro && erro.type === 'entity.parse.failed') {
      return res.status(422).json({
        ok: false,
        modo: MODO,
        erro: 'json_invalido',
        mensagem: 'O corpo da requisição não é um JSON válido.',
      });
    }
    registrar({ modo: MODO, rota: req.path, resultado: 'recusa', erro: 'falha_interna' });
    return res.status(500).json({
      ok: false,
      modo: MODO,
      erro: 'falha_interna',
      mensagem: 'Algo quebrou dentro do laboratório.',
    });
  });

  return app;
}

const porta = Number(process.env.PORT || 3000);
abrirBanco();
criarApp().listen(porta, () => {
  registrar({
    modo: MODO,
    rota: '/boot',
    acao: 'iniciar',
    resultado: 'ok',
    extras: {
      versao: VERSAO,
      porta,
      banco: CAMINHO_BANCO,
      limites: limitesPublicos(),
      custo_por_chamada_brl: LIMITES.custo_por_chamada_brl,
      aviso: 'DADOS FICTÍCIOS — a LumenShop não existe.',
    },
  });
});
