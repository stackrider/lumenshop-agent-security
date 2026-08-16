// npm run reset — recria o banco a partir da semente ficticia.
import { recriarBanco, CAMINHO_BANCO } from './db.js';

recriarBanco();
console.log(
  JSON.stringify({
    ok: true,
    acao: 'reset',
    banco: CAMINHO_BANCO,
    aviso: 'Banco recriado com dados fictícios. A LumenShop não existe.',
  })
);
