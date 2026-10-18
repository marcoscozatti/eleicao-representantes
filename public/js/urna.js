import { api, tocar, $ } from "./common.js";

const TOKEN_KEY = "eleicao.tokenAluno";
let token = sessionStorage.getItem(TOKEN_KEY);
let eleicao = null;   // { eleicaoId, jaVotou, candidatos }
let digitos = "";     // número digitado na urna ("BRANCO" para voto em branco)

function mostrarTela(id) {
  for (const t of ["tela-login", "tela-urna", "tela-fim"]) $(t).hidden = t !== id;
  $("btn-sair").hidden = id === "tela-login";
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
  const branco = digitos === "BRANCO";
  const numero = digitos.length === 2 ? Number(digitos) : null;
  const candidato = numero !== null ? eleicao.candidatos.find((c) => c.numero === numero) : null;

  $("digito-1").textContent = branco ? "" : digitos[0] ?? "";
  $("digito-2").textContent = branco ? "" : digitos[1] ?? "";
  $("visor-caixas").hidden = branco;
  $("visor-branco").hidden = !branco;

  $("visor-candidato").hidden = !candidato;
  $("visor-direita").hidden = !candidato;
  $("visor-foto").hidden = true;
  $("visor-sem-foto").hidden = true;
  $("visor-aviso").textContent = numero !== null && !candidato ? "NÚMERO INEXISTENTE" : "";

  if (candidato) {
    $("visor-nome").textContent = candidato.nome;
    if (candidato.fotoUrl) {
      $("visor-sem-foto").hidden = true;
      urlDaFoto(candidato.fotoUrl)
        .then((src) => {
          // Só exibe se o número digitado ainda for este
          if (Number(digitos) === candidato.numero) {
            $("visor-foto").src = src;
            $("visor-foto").hidden = false;
          }
        })
        .catch(() => { $("visor-sem-foto").hidden = false; });
    } else {
      $("visor-sem-foto").hidden = false;
    }
  }
}

function teclar(tecla) {
  tocar("bipe");
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
  if (!digitos) {
    $("visor-aviso").textContent = "DIGITE O NÚMERO DO CANDIDATO";
    return;
  }
  const branco = digitos === "BRANCO";
  const numero = branco ? null : Number(digitos);
  if (!branco && (digitos.length < 2 || !eleicao.candidatos.some((c) => c.numero === numero))) {
    $("visor-aviso").textContent = "NÚMERO INEXISTENTE. USE CORRIGE.";
    return;
  }
  try {
    await api("votos", {
      metodo: "POST",
      token,
      corpo: { eleicaoId: eleicao.eleicaoId, numero },
    });
    tocar("fim");
    mostrarTela("tela-fim");
  } catch (err) {
    $("visor-aviso").textContent = err.message.toUpperCase();
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
