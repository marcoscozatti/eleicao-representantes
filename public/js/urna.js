import { api, bipe, $ } from "./common.js";

const TOKEN_KEY = "eleicao.tokenAluno";
let token = sessionStorage.getItem(TOKEN_KEY);
let eleicao = null;   // { eleicaoId, jaVotou, candidatos }
let digitos = "";     // número digitado na urna

function mostrarTela(id) {
  for (const t of ["tela-login", "tela-urna", "tela-fim"]) $(t).hidden = t !== id;
}

// A foto exige o token no cabeçalho Authorization, e a tag <img> não envia esse cabeçalho.
// Por isso a foto é buscada com fetch e exibida por uma URL local (blob).
const fotosCache = new Map();
async function urlDaFoto(url) {
  if (!fotosCache.has(url)) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Foto indisponível (${r.status})`);
    fotosCache.set(url, URL.createObjectURL(await r.blob()));
  }
  return fotosCache.get(url);
}

function atualizarVisor() {
  const visor = $("visor-numero");
  visor.textContent = digitos.padEnd(2, "_");
  const candidato = eleicao.candidatos.find((c) => String(c.numero) === digitos);
  const area = $("visor-candidato");
  if (candidato) {
    area.hidden = false;
    $("visor-nome").textContent = candidato.nome;
    const foto = $("visor-foto");
    foto.hidden = true;
    if (candidato.fotoUrl) {
      urlDaFoto(candidato.fotoUrl)
        .then((src) => {
          // Só exibe se o candidato digitado ainda for este
          if (String(candidato.numero) === digitos) {
            foto.src = src;
            foto.hidden = false;
          }
        })
        .catch((err) => console.error(err));
    }
  } else {
    area.hidden = true;
  }
  $("visor-branco").hidden = digitos !== "BRANCO";
}

function teclar(tecla) {
  bipe();
  if (tecla === "CORRIGE") {
    digitos = "";
  } else if (tecla === "BRANCO") {
    digitos = "BRANCO";
  } else if (digitos !== "BRANCO" && digitos.length < 2) {
    digitos += tecla;
  }
  atualizarVisor();
}

async function confirmar() {
  if (!digitos) return;
  const branco = digitos === "BRANCO";
  const candidato = eleicao.candidatos.find((c) => String(c.numero) === digitos);
  if (!branco && !candidato) {
    $("aviso").textContent = "Número não encontrado. Use CORRIGE.";
    return;
  }
  try {
    await api("votos", {
      metodo: "POST",
      token,
      corpo: { eleicaoId: eleicao.eleicaoId, numero: branco ? null : candidato.numero },
    });
    bipe(600, 900);
    mostrarTela("tela-fim");
  } catch (err) {
    $("aviso").textContent = err.message;
  }
}

async function carregarEleicao() {
  try {
    eleicao = await api("eleicoes/ativa", { token });
    if (eleicao.jaVotou) {
      $("fim-texto").textContent = "Seu voto já foi registrado. Obrigado!";
      mostrarTela("tela-fim");
      return;
    }
    // Monta o teclado de candidatos na lista de referência
    const lista = $("lista-candidatos");
    lista.innerHTML = "";
    for (const c of eleicao.candidatos) {
      const li = document.createElement("li");
      li.textContent = `${String(c.numero).padStart(2, "0")} - ${c.nome}`;
      lista.appendChild(li);
    }
    digitos = "";
    atualizarVisor();
    mostrarTela("tela-urna");
  } catch (err) {
    sessionStorage.removeItem(TOKEN_KEY);
    token = null;
    $("login-erro").textContent = err.message;
    mostrarTela("tela-login");
  }
}

// ---------- Eventos ----------
$("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("login-erro").textContent = "";
  try {
    const r = await api("auth/aluno", {
      metodo: "POST",
      corpo: { matricula: $("matricula").value, senha: $("senha").value },
    });
    token = r.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    await carregarEleicao();
  } catch (err) {
    $("login-erro").textContent = err.message;
  }
});

document.querySelectorAll("[data-tecla]").forEach((b) =>
  b.addEventListener("click", () => teclar(b.dataset.tecla))
);
$("btn-confirma").addEventListener("click", confirmar);
$("btn-sair").addEventListener("click", async () => {
  await api("auth/logout", { metodo: "POST", token }).catch(() => {});
  sessionStorage.removeItem(TOKEN_KEY);
  token = null;
  mostrarTela("tela-login");
});

// Teclado do computador também funciona
document.addEventListener("keydown", (ev) => {
  if (tela() !== "tela-urna") return;
  if (/^[0-9]$/.test(ev.key)) teclar(ev.key);
  else if (ev.key === "Backspace" || ev.key === "Escape") teclar("CORRIGE");
  else if (ev.key === "Enter") confirmar();
});

function tela() {
  return ["tela-login", "tela-urna", "tela-fim"].find((t) => !$(t).hidden);
}

// Início: se já estiver logado, vai direto para a urna
if (token) carregarEleicao();
else mostrarTela("tela-login");
