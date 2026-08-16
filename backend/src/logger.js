// Log estruturado: uma linha JSON por requisicao e por recusa.
// A mesma linha vai para o stdout e para um anel de 200 posicoes em memoria,
// que GET /admin/logs devolve. E a tela da 4a regra do roteiro.

const TAMANHO_ANEL = 200;
const anel = [];

// Mascara telefone: +5511999990001 -> +5511*****0001
export function mascararTelefone(telefone) {
  if (!telefone) return null;
  const t = String(telefone);
  if (t.length <= 9) return t.slice(0, 2) + '*'.repeat(Math.max(0, t.length - 2));
  return t.slice(0, 5) + '*'.repeat(t.length - 9) + t.slice(-4);
}

// Mascara e-mail: joana.ficticia@exemplo.test -> j***@exemplo.test
export function mascararEmail(email) {
  if (!email) return null;
  const [usuario, dominio] = String(email).split('@');
  if (!dominio) return '***';
  return `${usuario.slice(0, 1)}***@${dominio}`;
}

export function registrar(linha) {
  const registro = {
    timestamp: new Date().toISOString(),
    modo: linha.modo ?? null,
    rota: linha.rota ?? null,
    sessao: linha.sessao ?? null,
    acao: linha.acao ?? null,
    resultado: linha.resultado ?? 'ok',
    erro: linha.erro ?? null,
    custo_simulado_brl: Number((linha.custo_simulado_brl ?? 0).toFixed(4)),
    custo_acumulado_dia_brl: Number((linha.custo_acumulado_dia_brl ?? 0).toFixed(4)),
    ...(linha.extras && Object.keys(linha.extras).length ? linha.extras : {}),
  };
  anel.push(registro);
  if (anel.length > TAMANHO_ANEL) anel.shift();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(registro));
  return registro;
}

// Mais novo primeiro.
export function linhas() {
  return [...anel].reverse();
}

export function limparLog() {
  anel.length = 0;
}
