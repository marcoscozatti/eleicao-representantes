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
  const selects = ["sel-turma-aluno", "sel-turma-eleicao", "sel-turma-import"];
  for (const id of selects) {
    const s = $(id);
    s.innerHTML = turmas.map((t) => `<option value="${t.id}">${t.nome} - ${t.curso}</option>`).join("");
  }
  return turmas;
}

async function carregarEleicoes() {
  const lista = await api("eleicoes", { token }).catch(() => []);
  $("lista-eleicoes").innerHTML = lista.length
    ? lista
        .map((e) => `<li>${e.dataEleicao} — ${e.status} — ID: <code>${e.id}</code>
           <button class="link" data-usar-id="${e.id}">usar esta eleição</button></li>`)
        .join("")
    : "<li>Nenhuma eleição criada.</li>";
}

// Clicar em "usar esta eleição" preenche o campo de ID e carrega os alunos da turma dela
$("lista-eleicoes").addEventListener("click", async (ev) => {
  const id = ev.target.dataset.usarId;
  if (!id) return;
  $("eleicao-id").value = id;
  msg(`Eleição ${id} selecionada.`);
  await carregarCandidatos(id);
});

// Preenche a lista de candidatos com os alunos da turma da eleição escolhida
async function carregarCandidatos(eleicaoId) {
  const eleicoes = await api("eleicoes", { token });
  const e = eleicoes.find((x) => x.id === eleicaoId);
  const alunos = await api(`alunos${e ? `?turmaId=${encodeURIComponent(e.turmaId)}` : ""}`, { token });
  $("sel-candidato").innerHTML = alunos.length
    ? alunos.map((a) => `<option value="${a.matricula}">${a.nome} (${a.matricula})</option>`).join("")
    : '<option value="">Nenhum aluno nesta turma</option>';
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
  if (!id) return msg("Escolha uma eleição na lista primeiro.", false);
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


// ---------- Importação em massa ----------
const NORMALIZAR = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// Lê o arquivo como UTF-8; se não for UTF-8 (comum no Excel do Windows), usa Windows-1252.
function lerTexto(arquivo) {
  return arquivo.arrayBuffer().then((buf) => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder("windows-1252").decode(buf);
    }
  });
}

// Separa uma linha CSV respeitando aspas. Aceita ";" ou "," como separador.
function separarLinha(linha, sep) {
  const campos = [];
  let atual = "", aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual.trim()); atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual.trim());
  return campos;
}

// Nomes aceitos para cada coluna (inclui os usados na exportação do sistema do Senac).
const ALIASES = {
  matricula: ["matricula", "matrícula", "id"],
  nome: ["nome", "nome completo"],
  email: ["email", "e-mail"],
  celular: ["celular", "telefone"],
};

function lerAlunosDoCsv(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) throw new Error("A planilha precisa ter cabeçalho e pelo menos um aluno.");
  const sep = linhas[0].split(";").length > linhas[0].split(",").length ? ";" : ",";
  const cabecalho = separarLinha(linhas[0], sep).map(NORMALIZAR);
  // Descobre em qual coluna está cada campo, aceitando os nomes alternativos
  const posicao = (campo) => {
    const i = cabecalho.findIndex((h) => ALIASES[campo].map(NORMALIZAR).includes(h));
    return i;
  };
  const colMatricula = posicao("matricula");
  const colNome = posicao("nome");
  if (colMatricula < 0 || colNome < 0) {
    throw new Error("A planilha precisa das colunas de matrícula (ID ou matricula) e de nome (Nome ou Nome Completo).");
  }
  const colEmail = posicao("email");
  const colCelular = posicao("celular");
  return linhas.slice(1).map((linha) => {
    const c = separarLinha(linha, sep);
    return {
      matricula: c[colMatricula] ?? "",
      nome: c[colNome] ?? "",
      email: colEmail >= 0 ? c[colEmail] ?? "" : "",
      celular: colCelular >= 0 ? c[colCelular] ?? "" : "",
    };
  });
}

function baixarCsv(nomeArquivo, linhas) {
  // BOM (\ufeff) faz o Excel abrir acentos corretamente
  const conteudo = "\ufeff" + linhas.join("\r\n");
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo; a.click();
  URL.revokeObjectURL(url);
}

let ultimasSenhas = [];

$("form-importar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const arquivo = f.get("arquivo");
  try {
    const alunos = lerAlunosDoCsv(await lerTexto(arquivo));
    const r = await api("alunos/importar", {
      metodo: "POST",
      token,
      corpo: { turmaId: f.get("turmaId"), alunos },
    });
    ultimasSenhas = r.resultados.filter((x) => x.senha);
    $("resumo-import").textContent = `${r.criados} de ${alunos.length} aluno(s) cadastrado(s).`;
    $("erros-import").innerHTML = r.resultados
      .filter((x) => x.erro)
      .map((x) => `<li>${x.matricula || "(sem matrícula)"} ${x.nome}: ${x.erro}</li>`)
      .join("");
    $("resultado-import").hidden = false;
    msg("Importação concluída.");
  } catch (err) {
    msg(err.message, false);
  }
});

$("btn-baixar-senhas").addEventListener("click", () => {
  const linhas = ["matricula;nome;senha", ...ultimasSenhas.map((x) => `${x.matricula};"${x.nome}";${x.senha}`)];
  baixarCsv("senhas-alunos.csv", linhas);
});

$("btn-novas-senhas").addEventListener("click", async () => {
  const turmaId = $("sel-turma-import").value;
  if (!turmaId) return msg("Escolha a turma.", false);
  if (!confirm("Isso troca a senha de TODOS os alunos desta turma. Continuar?")) return;
  try {
    const r = await api(`turmas/${encodeURIComponent(turmaId)}/senhas`, { metodo: "POST", token });
    ultimasSenhas = r.resultados;
    $("resumo-import").textContent = `Novas senhas geradas para ${r.total} aluno(s).`;
    $("erros-import").innerHTML = "";
    $("resultado-import").hidden = false;
    msg("Senhas geradas. Baixe a lista agora.");
  } catch (err) {
    msg(err.message, false);
  }
});

$("form-fotos").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const arquivos = Array.from(ev.target.fotos.files);
  let ok = 0;
  const falhas = [];
  for (const arq of arquivos) {
    const matricula = arq.name.replace(/\.[^.]+$/, "").trim();
    try {
      const base64 = await new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result).split(",")[1]);
        leitor.onerror = reject;
        leitor.readAsDataURL(arq);
      });
      await api(`alunos/${encodeURIComponent(matricula)}/foto`, {
        metodo: "POST", token, corpo: { contentType: arq.type, base64 },
      });
      ok++;
    } catch (err) {
      falhas.push(`${arq.name}: ${err.message}`);
    }
  }
  $("resumo-fotos").textContent = `${ok} foto(s) enviada(s).` + (falhas.length ? ` Falhas: ${falhas.join("; ")}` : "");
  ev.target.reset();
});

async function iniciar() {
  mostrarPainel(true);
  await carregarTurmas().catch((e) => msg(e.message, false));
  await carregarEleicoes();
}

if (token) iniciar();
else mostrarPainel(false);
