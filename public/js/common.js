// Utilidades compartilhadas pelas telas (urna e professor).
export async function api(caminho, { metodo = "GET", corpo, token } = {}) {
  const cabecalhos = {};
  if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
  if (token) cabecalhos["Authorization"] = `Bearer ${token}`;
  const resposta = await fetch(`/api/${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
  return dados;
}

// Bipe curto gerado pelo navegador (sem arquivo de áudio).
export function bipe(duracaoMs = 180, frequencia = 1500) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = frequencia;
    ganho.gain.value = 0.15;
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duracaoMs / 1000);
  } catch {
    // Navegador sem áudio: segue sem som.
  }
}

export const $ = (id) => document.getElementById(id);
