import { api, $ } from "./common.js";

const TOKEN_KEY = "eleicao.tokenProfessor";
const ELEICAO_KEY = "eleicao.atual";
let token = sessionStorage.getItem(TOKEN_KEY);
let eleicaoAtualId = sessionStorage.getItem(ELEICAO_KEY);
let turmas = [];
let alunos = [];
let eleicoes = [];
let ultimasSenhas = [];

const STATUS = {
  rascunho: "Rascunho",
  aberta: "Votação aberta",
  aguardando_apuracao: "Votação encerrada",
  apurada: "Apurada",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dataBr = (iso) => { const [a, m, d] = String(iso).split("-"); return a && m && d ? `${d}/${m}/${a}` : iso; };
const turmaSel = () => $("sel-turma-alunos").value;
const eleicaoAtual = () => eleicoes.find((e) => e.id === eleicaoAtualId) ?? null;
const textoStatus = (e) => STATUS[e.status] + (e.status === "aberta" && e.rodada > 1 ? " (segundo turno)" : "");
const nomeTurma = (id) => turmas.find((t) => t.id === id)?.nome ?? "";
const alunosDaTurma = (turmaId) =>
  alunos.filter((a) => a.turmaId === turmaId).sort((a, b) => a.nome.localeCompare(b.nome));

function msg(texto, ok = true) {
  const el = $("msg");
  el.textContent = texto;
  el.className = `msg-passo ${ok ? "ok" : "erro"}`;
}

function mostrarPainel(logado) {
  $("tela-login-prof").hidden = logado;
  $("painel").hidden = !logado;
  $("btn-sair-prof").hidden = !logado;
}

// ---------- Navegação por passos ----------
function irPasso(n) {
  document.querySelectorAll("[data-passo]").forEach((s) => { s.hidden = Number(s.dataset.passo) !== n; });
  document.querySelectorAll(".passos li").forEach((li, i) => li.classList.toggle("atual", i + 1 === n));
  msg("");
  window.scrollTo({ top: 0 });
}

// Um passo está feito quando o que ele pede já existe
function passosFeitos() {
  const e = eleicaoAtual();
  return {
    1: turmas.length > 0,
    2: alunos.length > 0,
    3: alunos.some((a) => a.fotoKey),
    4: eleicoes.length > 0,
    5: !!e && e.candidatos.length > 0,
    6: !!e && e.status !== "rascunho",
  };
}

function marcarPassos() {
  const feitos = passosFeitos();
  document.querySelectorAll(".passos li").forEach((li, i) => li.classList.toggle("feito", !!feitos[i + 1]));
}

// ---------- Desenho das telas ----------
function preencherTurmas() {
  const opcoes = turmas.length
    ? turmas.map((t) => `<option value="${esc(t.id)}">${esc(t.nome)} — ${esc(t.curso)}</option>`).join("")
    : '<option value="">Cadastre uma turma no passo 1</option>';
  const atual = $("sel-turma-alunos").value;
  $("sel-turma-alunos").innerHTML = opcoes;
  if (turmas.some((t) => t.id === atual)) $("sel-turma-alunos").value = atual;
  $("sel-turma-eleicao").innerHTML = opcoes;
}

function renderTurmas() {
  $("lista-turmas").innerHTML = turmas.length
    ? turmas.map((t) => `<li>${esc(t.nome)} — ${esc(t.curso)}</li>`).join("")
    : "<li>Nenhuma turma cadastrada.</li>";
}

// Tabela de alunos. No passo 2 ela traz as ações de editar e excluir.
function tabelaAlunos(lista, comAcoes) {
  if (!lista.length) return '<p class="ajuda">Nenhum aluno nesta turma ainda.</p>';
  const cabecalho = `<tr><th>Matrícula</th><th>Nome</th><th>Celular</th><th>E-mail</th><th>Foto</th>${comAcoes ? "<th>Ações</th>" : ""}</tr>`;
  const linhas = lista.map((a) => `<tr>
      <td>${esc(a.matricula)}</td>
      <td>${esc(a.nome)}</td>
      <td>${esc(a.celular) || "—"}</td>
      <td>${esc(a.email) || "—"}</td>
      <td>${a.fotoKey ? '<span class="badge badge-ok">com foto</span>' : '<span class="badge badge-alerta">sem foto</span>'}</td>
      ${comAcoes ? `<td class="acoes-linha">
        <button class="link" data-editar="${esc(a.matricula)}">Editar</button>
        <button class="link" data-excluir="${esc(a.matricula)}" style="color:#b3261e">Excluir</button>
      </td>` : ""}
    </tr>`).join("");
  return `<table class="tabela"><thead>${cabecalho}</thead><tbody>${linhas}</tbody></table>`;
}

// Lista de alunos da turma escolhida, com a situação da foto
function renderAlunos() {
  const lista = alunosDaTurma(turmaSel());
  $("tabela-alunos-2").innerHTML = tabelaAlunos(lista, true);
  const comFoto = lista.filter((a) => a.fotoKey).length;
  $("tabela-fotos").innerHTML = `<p class="ajuda">${comFoto} de ${lista.length} aluno(s) com foto.</p>${tabelaAlunos(lista, false)}`;
}

function renderEleicoes() {
  $("lista-eleicoes").innerHTML = eleicoes.length
    ? eleicoes.map((e) => `<li>${esc(nomeTurma(e.turmaId))} · ${dataBr(e.dataEleicao)} · ${textoStatus(e)}
        ${e.id === eleicaoAtualId
          ? '<span class="badge badge-ok">selecionada</span>'
          : `<button class="link" data-usar="${esc(e.id)}">usar esta</button>`}</li>`).join("")
    : "<li>Nenhuma eleição criada.</li>";
}

// Faixa no topo de todos os passos com a eleição em uso
function renderBanner() {
  const e = eleicaoAtual();
  $("banner-eleicao").innerHTML = e
    ? `<span><strong>Eleição atual:</strong> ${esc(nomeTurma(e.turmaId))} · <span class="badge">${esc(textoStatus(e))}</span></span>
       <button class="btn-secundario" data-ir="6">Ir para ações</button>`
    : `<span>Nenhuma eleição escolhida ainda.</span>
       <button class="btn-secundario" data-ir="4">Criar ou escolher</button>`;
}

function renderCandidatos() {
  const e = eleicaoAtual();
  const pode = !!e && e.status === "rascunho";
  $("aviso-candidatos").textContent = !e
    ? "Escolha ou crie uma eleição no passo 4."
    : pode
      ? "Escolha o aluno e o número que ele terá na urna. Candidatos só podem ser definidos antes de abrir a votação."
      : "A votação já foi aberta: não é possível mudar os candidatos desta eleição.";
  for (const el of $("form-candidato").elements) el.disabled = !pode;
  const opcoes = e ? alunosDaTurma(e.turmaId).map((a) => `<option value="${esc(a.matricula)}">${esc(a.nome)} (${esc(a.matricula)})</option>`).join("") : "";
  $("sel-candidato").innerHTML = opcoes || '<option value="">Nenhum aluno nesta turma</option>';
  const nomes = Object.fromEntries(alunos.map((a) => [a.matricula, a.nome]));
  $("lista-candidatos-eleicao").innerHTML = e && e.candidatos.length
    ? [...e.candidatos].sort((a, b) => a.numero - b.numero)
        .map((c) => `<li>nº ${String(c.numero).padStart(2, "0")} — ${esc(nomes[c.matricula] ?? c.matricula)}</li>`).join("")
    : "<li>Nenhum candidato ainda.</li>";
}

// Botões da etapa 6 só ficam ativos quando fazem sentido para a situação atual
function renderAcoes() {
  const e = eleicaoAtual();
  const st = e?.status;
  $("status-eleicao").textContent = e ? textoStatus(e) : "Nenhuma eleição escolhida";
  const dicas = {
    rascunho: "Confira os candidatos e clique em 1. Abrir votação. Depois disso, os alunos já podem votar.",
    aberta: "A votação está aberta. Acompanhe o progresso e clique em 2. Encerrar votação quando terminar.",
    aguardando_apuracao: "Votação encerrada. Clique em 3. Apurar para contar os votos.",
    apurada: "Apuração concluída. Baixe a ata em planilha (.xlsx) antes de apagar os dados.",
  };
  $("dica-acao").textContent = e ? dicas[st] : "Escolha ou crie uma eleição no passo 4.";
  const habilitar = {
    abrir: st === "rascunho",
    encerrar: st === "aberta",
    apurar: st === "aguardando_apuracao",
    ata: st === "apurada",
    progresso: !!e,
  };
  document.querySelectorAll("[data-acao]").forEach((b) => { b.disabled = !habilitar[b.dataset.acao]; });
}

async function carregarTudo() {
  const [t, el, al] = await Promise.all([
    api("turmas", { token }),
    api("eleicoes", { token }).catch(() => []),
    api("alunos", { token }).catch(() => []),
  ]);
  turmas = t;
  eleicoes = el;
  alunos = al;
  if (eleicaoAtualId && !eleicoes.some((x) => x.id === eleicaoAtualId)) {
    eleicaoAtualId = null;
    sessionStorage.removeItem(ELEICAO_KEY);
  }
  // Sem eleição escolhida, usa a mais recente criada
  if (!eleicaoAtualId && eleicoes.length) {
    eleicaoAtualId = eleicoes[eleicoes.length - 1].id;
    sessionStorage.setItem(ELEICAO_KEY, eleicaoAtualId);
  }
  preencherTurmas();
  renderTurmas();
  renderAlunos();
  renderEleicoes();
  renderCandidatos();
  renderAcoes();
  renderBanner();
  marcarPassos();
}

function usarEleicao(id) {
  eleicaoAtualId = id;
  sessionStorage.setItem(ELEICAO_KEY, id);
  renderEleicoes();
  renderBanner();
  renderCandidatos();
  renderAcoes();
  marcarPassos();
}

// ---------- Utilidades de arquivo ----------
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

const NORMALIZAR = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

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
  const posicao = (campo) => cabecalho.findIndex((h) => ALIASES[campo].map(NORMALIZAR).includes(h));
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
  // BOM (﻿) faz o Excel abrir acentos corretamente
  const conteudo = "﻿" + linhas.join("\r\n");
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo; a.click();
  URL.revokeObjectURL(url);
}

// ---------- Entrada e saída ----------
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

// ---------- Passo 1: turma ----------
$("form-turma").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    await api("turmas", { metodo: "POST", token, corpo: Object.fromEntries(new FormData(ev.target)) });
    ev.target.reset();
    await carregarTudo();
    irPasso(2);
    msg("Turma cadastrada. Agora cadastre os alunos.");
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Passo 2: alunos e senhas ----------
$("sel-turma-alunos").addEventListener("change", renderAlunos);

$("form-aluno").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!turmaSel()) return msg("Cadastre e escolha uma turma primeiro.", false);
  const f = new FormData(ev.target);
  try {
    const foto = await lerFoto(f.get("foto")?.size ? f.get("foto") : null);
    const r = await api("alunos", {
      metodo: "POST",
      token,
      corpo: {
        turmaId: turmaSel(),
        matricula: f.get("matricula"),
        nome: f.get("nome"),
        senha: f.get("senha"),
        email: f.get("email") || null,
        celular: f.get("celular") || null,
        foto,
      },
    });
    ev.target.reset();
    await carregarTudo();
    msg(`Aluno ${r.nome} cadastrado.`);
  } catch (err) {
    msg(err.message, false);
  }
});

$("form-importar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!turmaSel()) return msg("Cadastre e escolha uma turma primeiro.", false);
  const arquivo = new FormData(ev.target).get("arquivo");
  try {
    const lista = lerAlunosDoCsv(await lerTexto(arquivo));
    const r = await api("alunos/importar", { metodo: "POST", token, corpo: { turmaId: turmaSel(), alunos: lista } });
    ultimasSenhas = r.resultados.filter((x) => x.senha);
    $("resumo-import").textContent = `${r.criados} de ${lista.length} aluno(s) cadastrado(s).`;
    $("erros-import").innerHTML = r.resultados
      .filter((x) => x.erro)
      .map((x) => `<li>${esc(x.matricula || "(sem matrícula)")} ${esc(x.nome)}: ${esc(x.erro)}</li>`)
      .join("");
    $("resultado-import").hidden = false;
    ev.target.reset();
    await carregarTudo();
    msg("Importação concluída. Baixe a lista de senhas agora.");
  } catch (err) {
    msg(err.message, false);
  }
});

$("btn-novas-senhas").addEventListener("click", async () => {
  if (!turmaSel()) return msg("Escolha a turma.", false);
  if (!confirm("Isso troca a senha de TODOS os alunos desta turma. Continuar?")) return;
  try {
    const r = await api(`turmas/${encodeURIComponent(turmaSel())}/senhas`, { metodo: "POST", token });
    ultimasSenhas = r.resultados;
    $("resumo-import").textContent = `Novas senhas geradas para ${r.total} aluno(s).`;
    $("erros-import").innerHTML = "";
    $("resultado-import").hidden = false;
    msg("Senhas geradas. Baixe a lista agora.");
  } catch (err) {
    msg(err.message, false);
  }
});

$("btn-baixar-senhas").addEventListener("click", () => {
  const linhas = ["matricula;nome;senha", ...ultimasSenhas.map((x) => `${x.matricula};"${x.nome}";${x.senha}`)];
  baixarCsv("senhas-alunos.csv", linhas);
});

// ---------- Passo 3: fotos ----------
$("form-fotos").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const arquivos = Array.from(ev.target.fotos.files);
  let ok = 0;
  const falhas = [];
  for (const arq of arquivos) {
    const matricula = arq.name.replace(/\.[^.]+$/, "").trim();
    try {
      const foto = await lerFoto(arq);
      await api(`alunos/${encodeURIComponent(matricula)}/foto`, {
        metodo: "POST", token, corpo: { contentType: arq.type, base64: foto.base64 },
      });
      ok++;
    } catch (err) {
      falhas.push(`${arq.name}: ${err.message}`);
    }
  }
  $("resumo-fotos").textContent = `${ok} foto(s) enviada(s).` + (falhas.length ? ` Falhas: ${falhas.join("; ")}` : "");
  ev.target.reset();
  await carregarTudo();
});

// ---------- Passo 4: eleição ----------
$("form-eleicao").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    const r = await api("eleicoes", { metodo: "POST", token, corpo: Object.fromEntries(new FormData(ev.target)) });
    usarEleicao(r.id);
    await carregarTudo();
    irPasso(5);
    msg("Eleição criada e selecionada. Agora defina os candidatos.");
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Passo 5: candidatos ----------
$("form-candidato").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!eleicaoAtualId) return msg("Escolha uma eleição no passo 4.", false);
  const f = new FormData(ev.target);
  try {
    await api(`eleicoes/${eleicaoAtualId}/candidatos`, {
      metodo: "POST",
      token,
      corpo: { matricula: f.get("matricula"), numero: Number(f.get("numero")) },
    });
    ev.target.reset();
    await carregarTudo();
    msg("Candidato definido.");
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Passo 6: ações da eleição ----------
function mostrarResultado(r) {
  const pre = $("resultado-apuracao");
  if (!r.resultado) {
    pre.hidden = true;
    return msg(r.mensagem || `Situação: ${r.status}.`);
  }
  const x = r.resultado;
  const linhas = [
    x.eleito
      ? `Representante: ${x.eleito.nome} (nº ${x.eleito.numero})${x.desempatadoPorSorteio ? " — escolhido por sorteio" : ""}`
      : "Sem representante eleito (nenhum voto válido).",
    ...x.suplentes.map((s) => `Suplente ${s.ordem}: ${s.nome} (nº ${s.numero}, ${s.votos} votos)`),
    x.desempateSuplentesPorSorteio ? "Empate entre suplentes desempatado por sorteio." : "",
    `Brancos: ${x.brancos}. Rodadas: ${x.rodadas}.`,
  ].filter(Boolean);
  pre.textContent = linhas.join("\n");
  pre.hidden = false;
  msg("Apuração concluída.");
}

async function baixarAta(id) {
  // A ata exige o token no cabeçalho, por isso o download é feito com fetch
  const res = await fetch(`/api/eleicoes/${id}/ata`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const dados = await res.json().catch(() => ({}));
    throw new Error(dados.erro || "Não foi possível gerar a ata.");
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "ata-eleicao.xlsx";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  msg("Ata gerada em planilha (.xlsx).");
}

document.querySelectorAll("[data-acao]").forEach((b) =>
  b.addEventListener("click", async () => {
    const id = eleicaoAtualId;
    if (!id) return msg("Escolha uma eleição no passo 4.", false);
    const acao = b.dataset.acao;
    try {
      if (acao === "progresso") {
        const p = await api(`eleicoes/${id}/progresso`, { token });
        msg(`Votaram ${p.votaram} de ${p.total} eleitores${p.rodada > 1 ? " (segundo turno)" : ""}.`);
      } else if (acao === "apurar") {
        mostrarResultado(await api(`eleicoes/${id}/apurar`, { metodo: "POST", token }));
        await carregarTudo();
      } else if (acao === "ata") {
        await baixarAta(id);
      } else {
        await api(`eleicoes/${id}/${acao}`, { metodo: "POST", token });
        await carregarTudo();
        msg(acao === "abrir" ? "Votação aberta. Os alunos já podem votar." : "Votação encerrada. Agora clique em Apurar.");
      }
    } catch (err) {
      msg(err.message, false);
    }
  })
);

// ---------- Passo 2: editar e excluir aluno ----------
let matriculaEditada = null;

function fecharEdicao() {
  matriculaEditada = null;
  $("form-editar-aluno").reset();
  $("bloco-editar").hidden = true;
}

function abrirEdicao(matricula) {
  const a = alunos.find((x) => x.matricula === matricula);
  if (!a) return;
  matriculaEditada = matricula;
  const f = $("form-editar-aluno");
  f.nome.value = a.nome ?? "";
  f.email.value = a.email ?? "";
  f.celular.value = a.celular ?? "";
  $("editar-matricula").textContent = `Matrícula ${a.matricula}`;
  $("bloco-editar").hidden = false;
  $("bloco-editar").scrollIntoView({ behavior: "smooth", block: "center" });
}

$("form-editar-aluno").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!matriculaEditada) return;
  const f = new FormData(ev.target);
  try {
    await api(`alunos/${encodeURIComponent(matriculaEditada)}`, {
      metodo: "PATCH",
      token,
      corpo: { nome: f.get("nome"), email: f.get("email"), celular: f.get("celular") },
    });
    fecharEdicao();
    await carregarTudo();
    msg("Dados do aluno atualizados.");
  } catch (err) {
    msg(err.message, false);
  }
});

$("btn-cancelar-edicao").addEventListener("click", fecharEdicao);

async function excluirAlunoAdmin(matricula) {
  const a = alunos.find((x) => x.matricula === matricula);
  const aviso = `Remover ${a?.nome ?? matricula} (matrícula ${matricula}) da lista?\n\n` +
    "O aluno não poderá mais votar. Os dados continuam guardados no banco, mas essa matrícula não poderá ser cadastrada de novo.";
  if (!confirm(aviso)) return;
  await api(`alunos/${encodeURIComponent(matricula)}`, { metodo: "DELETE", token });
  if (matriculaEditada === matricula) fecharEdicao();
  await carregarTudo();
  msg("Aluno removido da lista. Os dados foram preservados no banco.");
}

// ---------- Passo 7: segurança e backup ----------
$("form-senha").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  if (f.get("nova") !== f.get("repita")) return msg("A confirmação não confere com a nova senha.", false);
  try {
    await api("admin/senha", { metodo: "POST", token, corpo: { atual: f.get("atual"), nova: f.get("nova") } });
    ev.target.reset();
    msg("Senha do professor alterada. Use a nova senha no próximo acesso.");
  } catch (err) {
    msg(err.message, false);
  }
});

$("btn-backup").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/admin/backup", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const dados = await res.json().catch(() => ({}));
      throw new Error(dados.erro || "Não foi possível gerar o backup.");
    }
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "backup-eleicao.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    msg("Backup baixado. Guarde o arquivo em local seguro.");
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Passo 8: apagar tudo ----------
$("btn-apagar-tudo").addEventListener("click", async () => {
  const digitado = prompt("Para apagar TODOS os dados, digite exatamente: APAGAR TUDO");
  if (digitado !== "APAGAR TUDO") return msg("Operação cancelada.", false);
  try {
    const r = await api("admin/apagar-tudo", { metodo: "POST", token, corpo: { confirmacao: digitado } });
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ELEICAO_KEY);
    token = null;
    eleicaoAtualId = null;
    alert(`${r.apagados} registro(s) apagado(s). Entre novamente.`);
    mostrarPainel(false);
  } catch (err) {
    msg(err.message, false);
  }
});

// ---------- Navegação (botões dos passos, banner e listas) ----------
document.addEventListener("click", (ev) => {
  const editar = ev.target.closest("[data-editar]");
  if (editar) return abrirEdicao(editar.dataset.editar);
  const excluir = ev.target.closest("[data-excluir]");
  if (excluir) return excluirAlunoAdmin(excluir.dataset.excluir).catch((err) => msg(err.message, false));

  const t = ev.target.closest("[data-ir],[data-proximo],[data-anterior],[data-usar]");
  if (!t) return;
  if (t.dataset.usar) {
    usarEleicao(t.dataset.usar);
    return msg("Eleição selecionada.");
  }
  const n = Number(t.dataset.ir ?? t.dataset.proximo ?? t.dataset.anterior);
  irPasso(n);
});

// Abre no primeiro passo que ainda falta fazer
async function iniciar() {
  mostrarPainel(true);
  try {
    await carregarTudo();
    const feitos = passosFeitos();
    const proximo = [1, 2, 3, 4, 5, 6].find((k) => !feitos[k]) ?? 6;
    irPasso(proximo);
  } catch (err) {
    msg(err.message, false);
    irPasso(1);
  }
}

if (token) iniciar();
else mostrarPainel(false);
