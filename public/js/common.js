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

// Sons da urna. Se existir o arquivo em /audio/ (bipe.mp3 ou fim.mp3), ele toca;
// caso contrário, o navegador gera um som parecido.
const ARQUIVOS_SOM = { bipe: "/audio/bipe.mp3", fim: "/audio/fim.mp3" };
const arquivoIndisponivel = {};

function sintetizar(nome) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const tom = (inicio, duracao, freq) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      ganho.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + inicio + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracao + 0.05);
    };
    if (nome === "fim") {
      tom(0, 1.1, 1300);          // som longo de fim de voto
    } else {
      tom(0, 0.14, 1500);         // bipe de cada tecla
    }
  } catch {
    // Navegador sem áudio: segue sem som.
  }
}

export function tocar(nome) {
  if (arquivoIndisponivel[nome]) return sintetizar(nome);
  const audio = new Audio(ARQUIVOS_SOM[nome]);
  audio.onerror = () => {
    arquivoIndisponivel[nome] = true;
    sintetizar(nome);
  };
  // Erro de arquivo cai em onerror; aqui só evita erro não tratado
  audio.play().catch(() => {});
}

export const $ = (id) => document.getElementById(id);
