// Backend da eleição de representantes (Netlify Functions + Netlify Blobs).
// Todas as rotas /api/* passam por aqui (ver netlify.toml).
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";

// ---------- Configuração ----------
const SESSAO_HORAS = 12;
const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];

// Armazenamento persistente com leitura forte (importante para a votação).
const store = () => getStore({ name: "eleicao", consistency: "strong" });

// ---------- Utilidades ----------
const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const erro = (mensagem: string, status: number) => json({ erro: mensagem }, status);

async function corpo<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

function tokenDe(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

type Sessao = { papel: "professor" | "aluno"; matricula?: string; expiraEm: number };

async function sessaoDe(req: Request): Promise<Sessao | null> {
  const token = tokenDe(req);
  if (!token) return null;
  const s = await store().get(`sessao/${token}`, { type: "json" }) as Sessao | null;
  if (!s || s.expiraEm < Date.now()) return null;
  return s;
}

async function criarSessao(papel: Sessao["papel"], matricula?: string) {
  const token = randomUUID();
  const sessao: Sessao = {
    papel,
    matricula,
    expiraEm: Date.now() + SESSAO_HORAS * 3600 * 1000,
  };
  await store().setJSON(`sessao/${token}`, sessao);
  return token;
}

// Lista todas as chaves de um prefixo (paginado pelo próprio Blobs).
async function chaves(prefixo: string): Promise<string[]> {
  const resultado = await store().list({ prefix: prefixo });
  return resultado.blobs.map((b) => b.key);
}

// ---------- Rotas de autenticação ----------
async function loginProfessor(req: Request) {
  const { senha } = await corpo<{ senha?: string }>(req);
  if (!senha || senha !== process.env.ADMIN_PASSWORD) {
    return erro("Senha inválida", 401);
  }
  return json({ token: await criarSessao("professor") });
}

async function loginAluno(req: Request) {
  const { matricula, senha } = await corpo<{ matricula?: string; senha?: string }>(req);
  const aluno = matricula
    ? (await store().get(`aluno/${matricula.trim()}`, { type: "json" })) as
        | { senhaHash: string } | null
    : null;
  if (!aluno || !senha || !(await bcrypt.compare(senha, aluno.senhaHash))) {
    return erro("Matrícula ou senha inválida", 401);
  }
  return json({ token: await criarSessao("aluno", matricula!.trim()) });
}

async function logout(req: Request) {
  const token = tokenDe(req);
  if (token) await store().delete(`sessao/${token}`);
  return new Response(null, { status: 204 });
}

// ---------- Turmas (professor) ----------
async function criarTurma(req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const { nome, curso, oferta, horario } = await corpo<Record<string, string>>(req);
  if (!nome || !curso) return erro("Nome e curso são obrigatórios", 400);
  const id = randomUUID();
  await store().setJSON(`turma/${id}`, { id, nome, curso, oferta, horario });
  return json({ id, nome }, 201);
}

async function listarTurmas(s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const turmas = await Promise.all(
    (await chaves("turma/")).map((k) => store().get(k, { type: "json" }))
  );
  return json(turmas);
}

// ---------- Senhas e fotos ----------
// Alfabeto sem caracteres parecidos (0/O, 1/l/I) para facilitar a leitura no papel.
const ALFABETO_SENHA = "abcdefghjkmnpqrstuvwxyz23456789";
function gerarSenha(tamanho = 8): string {
  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += ALFABETO_SENHA[randomInt(ALFABETO_SENHA.length)];
  return senha;
}

async function salvarFoto(matricula: string, foto: { contentType: string; base64: string }) {
  if (!FOTO_TIPOS.includes(foto.contentType)) throw new Error("A foto deve ser JPEG, PNG ou WebP");
  const bytes = Buffer.from(foto.base64, "base64");
  if (bytes.length > FOTO_MAX_BYTES) throw new Error("Foto maior que 2 MB");
  const key = `foto/${matricula}`;
  await store().set(key, new Blob([bytes]), { metadata: { contentType: foto.contentType } });
  return key;
}

// Importação em massa: cria vários alunos da mesma turma e gera senha aleatória para cada um.
// As senhas são devolvidas UMA vez, na resposta; o sistema guarda só o hash.
async function importarAlunos(req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const { turmaId, alunos } = await corpo<{
    turmaId?: string;
    alunos?: { matricula?: string; nome?: string; email?: string; celular?: string }[];
  }>(req);
  if (!turmaId) return erro("Turma é obrigatória", 400);
  if (!Array.isArray(alunos) || alunos.length === 0) return erro("Nenhum aluno enviado", 400);
  if (alunos.length > 200) return erro("Envie no máximo 200 alunos por vez", 400);

  const resultados: { matricula: string; nome: string; senha?: string; erro?: string }[] = [];
  for (const a of alunos) {
    const matricula = (a.matricula ?? "").trim();
    const nome = (a.nome ?? "").trim();
    if (!matricula || !nome) {
      resultados.push({ matricula, nome, erro: "Matrícula e nome são obrigatórios" });
      continue;
    }
    if (await store().get(`aluno/${matricula}`)) {
      resultados.push({ matricula, nome, erro: "Matrícula já cadastrada" });
      continue;
    }
    const senha = gerarSenha();
    await store().setJSON(`aluno/${matricula}`, {
      matricula,
      turmaId,
      nome,
      email: a.email?.trim() || null,
      celular: a.celular?.trim() || null,
      senhaHash: await bcrypt.hash(senha, 10),
      fotoKey: null,
    });
    resultados.push({ matricula, nome, senha });
  }
  return json({
    criados: resultados.filter((r) => r.senha).length,
    resultados,
  }, 201);
}

async function enviarFoto(matricula: string, req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const aluno = (await store().get(`aluno/${matricula}`, { type: "json" })) as any;
  if (!aluno) return erro("Aluno não encontrado", 404);
  const foto = await corpo<{ contentType: string; base64: string }>(req);
  try {
    const key = await salvarFoto(matricula, foto);
    await store().setJSON(`aluno/${matricula}`, { ...aluno, fotoKey: key });
    return json({ matricula, ok: true }, 201);
  } catch (e) {
    return erro((e as Error).message, 400);
  }
}

// Gera novas senhas para todos os alunos de uma turma (útil quando a lista foi perdida).
async function novasSenhasDaTurma(turmaId: string, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const alunos = await Promise.all(
    (await chaves("aluno/")).map((k) => store().get(k, { type: "json" }) as Promise<any>)
  );
  const daTurma = alunos.filter((a) => a.turmaId === turmaId);
  if (daTurma.length === 0) return erro("Nenhum aluno nesta turma", 404);

  const resultados: { matricula: string; nome: string; senha: string }[] = [];
  for (const a of daTurma) {
    const senha = gerarSenha();
    await store().setJSON(`aluno/${a.matricula}`, { ...a, senhaHash: await bcrypt.hash(senha, 10) });
    resultados.push({ matricula: a.matricula, nome: a.nome, senha });
  }
  return json({ total: resultados.length, resultados });
}

// ---------- Alunos (professor) ----------
async function cadastrarAluno(req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const dados = await corpo<{
    turmaId?: string; matricula?: string; nome?: string; senha?: string;
    email?: string; celular?: string;
    foto?: { contentType: string; base64: string };
  }>(req);

  if (!dados.turmaId || !dados.matricula?.trim() || !dados.nome?.trim()) {
    return erro("Turma, matrícula e nome são obrigatórios", 400);
  }
  if (!dados.senha || dados.senha.length < 6) {
    return erro("A senha deve ter pelo menos 6 caracteres", 400);
  }
  const matricula = dados.matricula.trim();
  if (await store().get(`aluno/${matricula}`)) {
    return erro("Matrícula já cadastrada", 409);
  }

  let fotoKey: string | null = null;
  if (dados.foto) {
    try {
      fotoKey = await salvarFoto(matricula, dados.foto);
    } catch (e) {
      return erro((e as Error).message, 400);
    }
  }

  await store().setJSON(`aluno/${matricula}`, {
    matricula,
    turmaId: dados.turmaId,
    nome: dados.nome.trim(),
    email: dados.email ?? null,
    celular: dados.celular ?? null,
    senhaHash: await bcrypt.hash(dados.senha, 10),
    fotoKey,
  });
  return json({ matricula, nome: dados.nome.trim() }, 201);
}

async function listarAlunos(req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const turmaId = new URL(req.url).searchParams.get("turmaId");
  const alunos = await Promise.all(
    (await chaves("aluno/")).map((k) => store().get(k, { type: "json" }) as Promise<any>)
  );
  return json(
    alunos
      .filter((a) => !turmaId || a.turmaId === turmaId)
      .map(({ senhaHash, ...publico }) => publico)
      .sort((a, b) => a.nome.localeCompare(b.nome))
  );
}

// Foto de um aluno (qualquer usuário logado pode ver, para a tela da urna).
async function foto(matricula: string, s: Sessao | null) {
  if (!s) return erro("Não autenticado", 401);
  const meta = await store().getWithMetadata(`foto/${matricula}`, { type: "arrayBuffer" });
  if (!meta) return erro("Foto não encontrada", 404);
  return new Response(meta.data as ArrayBuffer, {
    headers: {
      "content-type": (meta.metadata?.contentType as string) ?? "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  });
}

// ---------- Eleições (professor) ----------
type Eleicao = {
  id: string; turmaId: string; dataEleicao: string;
  mandatoInicio: string; mandatoFim: string;
  status: "rascunho" | "aberta" | "aguardando_apuracao" | "segundo_turno" | "apurada" | "apagada";
  rodada: number;
  candidatos: { matricula: string; numero: number }[];
};

async function carregarEleicao(id: string): Promise<Eleicao | null> {
  return (await store().get(`eleicao/${id}`, { type: "json" })) as Eleicao | null;
}

async function criarEleicao(req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const d = await corpo<Record<string, string>>(req);
  if (!d.turmaId || !d.dataEleicao || !d.mandatoInicio || !d.mandatoFim) {
    return erro("Turma, data e período do mandato são obrigatórios", 400);
  }
  const eleicao: Eleicao = {
    id: randomUUID(), turmaId: d.turmaId, dataEleicao: d.dataEleicao,
    mandatoInicio: d.mandatoInicio, mandatoFim: d.mandatoFim,
    status: "rascunho", rodada: 1, candidatos: [],
  };
  await store().setJSON(`eleicao/${eleicao.id}`, eleicao);
  return json(eleicao, 201);
}

async function listarEleicoes(s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const eleicoes = await Promise.all(
    (await chaves("eleicao/")).map((k) => store().get(k, { type: "json" }) as Promise<Eleicao>)
  );
  return json(eleicoes);
}

// Abrir: copia os alunos da turma para a lista de eleitores.
async function abrirEleicao(id: string, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const e = await carregarEleicao(id);
  if (!e) return erro("Eleição não encontrada", 404);
  if (e.status !== "rascunho") return erro("Só é possível abrir uma eleição em rascunho", 409);

  const alunos = await Promise.all(
    (await chaves("aluno/")).map((k) => store().get(k, { type: "json" }) as Promise<any>)
  );
  const eleitores = alunos.filter((a) => a.turmaId === e.turmaId).map((a) => a.matricula);
  await store().setJSON(`eleitores/${id}`, eleitores);

  e.status = "aberta";
  await store().setJSON(`eleicao/${id}`, e);
  return json({ id, status: e.status, eleitores: eleitores.length });
}

// Encerrar a votação. A apuração só começa quando o professor iniciar.
async function encerrarEleicao(id: string, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const e = await carregarEleicao(id);
  if (!e) return erro("Eleição não encontrada", 404);
  if (e.status !== "aberta") return erro("Só é possível encerrar uma eleição aberta", 409);
  e.status = "aguardando_apuracao";
  await store().setJSON(`eleicao/${id}`, e);
  return json({ id, status: e.status });
}

// Candidatos: o professor define quem concorre e o número da urna.
async function definirCandidato(id: string, req: Request, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const e = await carregarEleicao(id);
  if (!e) return erro("Eleição não encontrada", 404);
  if (e.status !== "rascunho") return erro("Candidatos só podem ser definidos antes de abrir a eleição", 409);
  const { matricula, numero } = await corpo<{ matricula?: string; numero?: number }>(req);
  if (!matricula || !numero) return erro("Matrícula e número são obrigatórios", 400);
  if (e.candidatos.some((c) => c.numero === numero || c.matricula === matricula)) {
    return erro("Número ou candidato já usado nesta eleição", 409);
  }
  e.candidatos.push({ matricula, numero });
  await store().setJSON(`eleicao/${id}`, e);
  return json(e.candidatos, 201);
}

async function progresso(id: string, s: Sessao | null) {
  if (s?.papel !== "professor") return erro("Acesso restrito ao professor", 401);
  const eleitores = ((await store().get(`eleitores/${id}`, { type: "json" })) as string[]) ?? [];
  const votaram = (await chaves(`votou/${id}/`)).length;
  return json({ total: eleitores.length, votaram });
}

// ---------- Urna (aluno) ----------
// Eleição aberta da turma do aluno, com candidatos para a tela de votação.
async function eleicaoAtiva(s: Sessao | null) {
  if (s?.papel !== "aluno" || !s.matricula) return erro("Não autenticado", 401);
  const aluno = (await store().get(`aluno/${s.matricula}`, { type: "json" })) as any;
  const eleicoes = await Promise.all(
    (await chaves("eleicao/")).map((k) => store().get(k, { type: "json" }) as Promise<Eleicao>)
  );
  const e = eleicoes.find((x) => x.turmaId === aluno.turmaId && x.status === "aberta");
  if (!e) return erro("Nenhuma eleição aberta para a sua turma", 404);

  const eleitores = ((await store().get(`eleitores/${e.id}`, { type: "json" })) as string[]) ?? [];
  if (!eleitores.includes(s.matricula)) return erro("Você não está na lista de eleitores", 403);

  const jaVotou = !!(await store().get(`votou/${e.id}/${s.matricula}`));
  const candidatos = await Promise.all(
    e.candidatos.map(async (c) => {
      const cand = (await store().get(`aluno/${c.matricula}`, { type: "json" })) as any;
      return { numero: c.numero, nome: cand.nome, fotoUrl: cand.fotoKey ? `/api/fotos/${c.matricula}` : null };
    })
  );
  return json({ eleicaoId: e.id, jaVotou, candidatos: candidatos.sort((a, b) => a.numero - b.numero) });
}

// Registra um voto. Regra: um voto por aluno; voto em branco tem numero null.
async function votar(req: Request, s: Sessao | null) {
  if (s?.papel !== "aluno" || !s.matricula) return erro("Não autenticado", 401);
  const { eleicaoId, numero } = await corpo<{ eleicaoId?: string; numero?: number | null }>(req);
  if (!eleicaoId) return erro("Eleição não informada", 400);

  const e = await carregarEleicao(eleicaoId);
  if (!e || e.status !== "aberta") return erro("A votação não está aberta", 409);

  const eleitores = ((await store().get(`eleitores/${eleicaoId}`, { type: "json" })) as string[]) ?? [];
  if (!eleitores.includes(s.matricula)) return erro("Você não está na lista de eleitores", 403);

  // Valida o voto antes de qualquer gravação.
  const branco = numero === null || numero === undefined;
  if (!branco && !e.candidatos.some((c) => c.numero === numero)) {
    return erro("Número de candidato inválido", 400);
  }

  const marca = `votou/${eleicaoId}/${s.matricula}`;
  if (await store().get(marca)) return erro("Você já votou nesta eleição", 409);

  // Blobs não tem escrita condicional nesta versão: gravamos uma marca com um
  // identificador e lemos de volta. Se outro voto gravou por cima ao mesmo tempo,
  // este pedido é recusado.
  const nonce = randomUUID();
  await store().setJSON(marca, { nonce, registradoEm: new Date().toISOString() });
  const gravada = (await store().get(marca, { type: "json" })) as { nonce: string } | null;
  if (gravada?.nonce !== nonce) return erro("Voto concorrente detectado, tente novamente", 409);

  // O voto é guardado sem qualquer ligação com a matrícula.
  await store().setJSON(`votos/${eleicaoId}/${e.rodada}/${randomUUID()}`, {
    numero: numero ?? null,
  });
  return json({ ok: true, mensagem: "Voto registrado" }, 201);
}

// ---------- Roteamento ----------
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const caminho = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const metodo = req.method;
  const s = await sessaoDe(req);

  // Autenticação
  if (metodo === "POST" && caminho === "auth/professor") return loginProfessor(req);
  if (metodo === "POST" && caminho === "auth/aluno") return loginAluno(req);
  if (metodo === "POST" && caminho === "auth/logout") return logout(req);

  // Turmas
  if (caminho === "turmas" && metodo === "POST") return criarTurma(req, s);
  if (caminho === "turmas" && metodo === "GET") return listarTurmas(s);
  const mSenhas = caminho.match(/^turmas\/([^/]+)\/senhas$/);
  if (mSenhas && metodo === "POST") return novasSenhasDaTurma(decodeURIComponent(mSenhas[1]), s);

  // Alunos
  if (caminho === "alunos" && metodo === "POST") return cadastrarAluno(req, s);
  if (caminho === "alunos/importar" && metodo === "POST") return importarAlunos(req, s);
  const mFotoAluno = caminho.match(/^alunos\/([^/]+)\/foto$/);
  if (mFotoAluno && metodo === "POST") return enviarFoto(decodeURIComponent(mFotoAluno[1]), req, s);
  if (caminho === "alunos" && metodo === "GET") return listarAlunos(req, s);

  // Fotos
  const mFoto = caminho.match(/^fotos\/([^/]+)$/);
  if (mFoto && metodo === "GET") return foto(decodeURIComponent(mFoto[1]), s);

  // Eleições
  if (caminho === "eleicoes" && metodo === "POST") return criarEleicao(req, s);
  if (caminho === "eleicoes" && metodo === "GET") return listarEleicoes(s);
  if (caminho === "eleicoes/ativa" && metodo === "GET") return eleicaoAtiva(s);
  if (caminho === "votos" && metodo === "POST") return votar(req, s);

  const mEleicao = caminho.match(/^eleicoes\/([^/]+)\/(abrir|encerrar|candidatos|progresso)$/);
  if (mEleicao) {
    const [, id, acao] = mEleicao;
    if (acao === "abrir" && metodo === "POST") return abrirEleicao(id, s);
    if (acao === "encerrar" && metodo === "POST") return encerrarEleicao(id, s);
    if (acao === "candidatos" && metodo === "POST") return definirCandidato(id, req, s);
    if (acao === "progresso" && metodo === "GET") return progresso(id, s);
  }

  return erro("Rota não encontrada", 404);
};

export const config: Config = {
  path: "/api/*",
};
