// Banco do laboratorio. SQLite em arquivo, criado e semeado no boot.
// TUDO AQUI E FICCAO: a LumenShop nao existe.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semear } from './seed.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_BANCO =
  process.env.DB_PATH || path.join(aqui, '..', 'data', 'lumenshop.sqlite');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS clientes (
  telefone            TEXT PRIMARY KEY,
  nome                TEXT NOT NULL,
  email               TEXT NOT NULL,
  cidade              TEXT NOT NULL,
  observacao_ficticia TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
  id               TEXT PRIMARY KEY,
  cliente_telefone TEXT NOT NULL,
  produto          TEXT NOT NULL,
  valor_brl        REAL NOT NULL,
  status           TEXT NOT NULL,
  prazo_entrega    TEXT NOT NULL,
  endereco         TEXT NOT NULL,
  observacoes      TEXT NOT NULL DEFAULT '',
  criado_em        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogo (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  cores     TEXT NOT NULL,
  preco_brl REAL NOT NULL,
  estoque   INTEGER NOT NULL,
  descricao TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cupons (
  id          TEXT PRIMARY KEY,
  percentual  REAL NOT NULL,
  frete_gratis INTEGER NOT NULL DEFAULT 0,
  regra       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chamados (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id        TEXT,
  cliente_telefone TEXT,
  assunto          TEXT NOT NULL,
  descricao        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'aberto',
  origem           TEXT NOT NULL DEFAULT 'agente',
  modo             TEXT NOT NULL,
  criado_em        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aplicacoes_cupom (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id   TEXT NOT NULL,
  cupom_id    TEXT,
  percentual  REAL NOT NULL,
  motivo      TEXT NOT NULL DEFAULT '',
  modo        TEXT NOT NULL,
  criado_em   TEXT NOT NULL
);
`;

let bancoAberto = null;

export function abrirBanco() {
  if (bancoAberto) return bancoAberto;
  fs.mkdirSync(path.dirname(CAMINHO_BANCO), { recursive: true });
  const banco = new Database(CAMINHO_BANCO);
  banco.pragma('journal_mode = WAL');
  banco.exec(ESQUEMA);
  const vazio = banco.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n === 0;
  if (vazio) semear(banco);
  bancoAberto = banco;
  return banco;
}

// Apaga tudo e semeia de novo. Usado por POST /admin/reset e npm run reset.
export function recriarBanco() {
  const banco = abrirBanco();
  banco.exec(`
    DELETE FROM aplicacoes_cupom;
    DELETE FROM chamados;
    DELETE FROM cupons;
    DELETE FROM catalogo;
    DELETE FROM pedidos;
    DELETE FROM clientes;
    DELETE FROM sqlite_sequence WHERE name IN ('chamados','aplicacoes_cupom');
  `);
  semear(banco);
  return banco;
}
