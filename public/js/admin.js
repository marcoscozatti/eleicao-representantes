import { api, $ } from "./common.js";

const TOKEN_KEY = "eleicao.tokenProfessor";
let token = sessionStorage.getItem(TOKEN_KEY);

function mostrarPainel(logado) {
  $("tela-login-prof").hidden = logado;
  $("painel").hidden = !logado;
}

function msg(texto, ok = true) {
  const el = $("msg");
  el.textContent = texto;
  el.className = ok ? "ok" : "erro";
}

async function carregarTurmas() {
  const turmas = await api("turmas", { token });
  const selects = ["sel-turma-aluno", "sel-turma-eleicao"];
  for (const id of selects) {
    const s = $(id);
    s.innerHTML = turmas.map((t) => `<option value="${t.id}">${t.nome} - ${t.curso}</option>`).join("");
  }
  return turmas;
}

async function carregarEleicoes() {
  const lista = await api("eleicoes", { token }).catch(() => []);
  $("lista-eleicoes").innerHTML = lista.length
    ? lista.map((e) => `<li>${e.dataEleicao} — ${e.status}</li>`).join("")
    : "<li>Nenhuma eleição criada.</li>";
}

// ---------- Login ----------
$("form-login-prof").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const r = await api("auth/professor", { metodo: "POST", corpo: { senha: $("senha-prof").value } });
    token = r.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    await iniciar();
  } catch (err) {
    $("erro-login-prof").textContent = err.message;
  }
});

$("btn-sair-prof").addEventListener("click", async () => {
  await api("auth/logout", { metodo: "POST", token }).catch(() => {});
  sessionStorage.removeItem(TOKEN_KEY);
  token = null;
  mostrarPainel(false);
});

// ---------- Turmas ----------
$("form-turma").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    await api("turmas", { metodo: "POST", token, corpo: Object.fromEntries(f) });
    ev.target.reset();
    msg("Turma cadastrada.");
    await carregarTurmas();
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Alunos (com foto) ----------
function lerFoto(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo) return resolve(null);
    const leitor = new FileReader();
    leitor.onload = () => {
      const base64 = String(leitor.result).split(",")[1];
      resolve({ contentType: arquivo.type, base64 });
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

$("form-aluno").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    const foto = await lerFoto(f.get("foto")?.size ? f.get("foto") : null);
    const dados = {
      turmaId: f.get("turmaId"),
      matricula: f.get("matricula"),
      nome: f.get("nome"),
      senha: f.get("senha"),
      email: f.get("email") || null,
      celular: f.get("celular") || null,
      foto,
    };
    const r = await api("alunos", { metodo: "POST", token, corpo: dados });
    ev.target.reset();
    msg(`Aluno ${r.nome} cadastrado.`);
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Eleição ----------
$("form-eleicao").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    await api("eleicoes", { metodo: "POST", token, corpo: Object.fromEntries(f) });
    msg("Eleição criada (rascunho).");
    await carregarEleicoes();
  } catch (err) {
    msg(err.message, false);
  }
});

// Ações sobre a eleição: informe o ID e clique no botão desejado
document.querySelectorAll("[data-acao]").forEach((b) =>
  b.addEventListener("click", async () => {
    const id = $("eleicao-id").value.trim();
    if (!id) return msg("Informe o ID da eleição.", false);
    const acao = b.dataset.acao;
    try {
      if (acao === "progresso") {
        const p = await api(`eleicoes/${id}/progresso`, { token });
        msg(`Votaram ${p.votaram} de ${p.total} eleitores.`);
      } else {
        const r = await api(`eleicoes/${id}/${acao}`, { metodo: "POST", token });
        msg(`Situação: ${r.status}${r.eleitores !== undefined ? ` (${r.eleitores} eleitores)` : ""}.`);
        await carregarEleicoes();
      }
    } catch (err) {
      msg(err.message, false);
    }
  })
);

$("form-candidato").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const id = $("eleicao-id").value.trim();
  if (!id) return msg("Informe o ID da eleição.", false);
  try {
    await api(`eleicoes/${id}/candidatos`, {
      metodo: "POST",
      token,
      corpo: { matricula: f.get("matricula"), numero: Number(f.get("numero")) },
    });
    ev.target.reset();
    msg("Candidato definido.");
  } catch (err) {
    msg(err.message, false);
  }
});

async function iniciar() {
  mostrarPainel(true);
  await carregarTurmas().catch((e) => msg(e.message, false));
  await carregarEleicoes();
}

if (token) iniciar();
else mostrarPainel(false);
