-- Esquema do sistema de eleição de representantes estudantis
-- SQLite. Uma eleição por turma e por mandato.

PRAGMA foreign_keys = ON;

-- Turmas (uma linha por turma; um mesmo banco serve várias turmas)
CREATE TABLE IF NOT EXISTS turma (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT NOT NULL,              -- ex.: TGT4
    curso       TEXT NOT NULL,              -- ex.: Técnico em Guia de Turismo
    oferta      TEXT,                       -- código da oferta
    horario     TEXT                        -- ex.: NOITE
);

-- Alunos cadastrados (candidatos e eleitores são alunos da turma)
CREATE TABLE IF NOT EXISTS aluno (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id    INTEGER NOT NULL REFERENCES turma(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,              -- nome completo
    matricula   TEXT NOT NULL UNIQUE,       -- login do eleitor (matrícula)
    senha_hash  TEXT NOT NULL,              -- senha armazenada apenas como hash (bcrypt/argon2)
    email       TEXT,
    celular     TEXT,
    foto_path   TEXT,                       -- caminho do arquivo na pasta de fotos (não o binário)
    criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eleição de uma turma em um mandato
CREATE TABLE IF NOT EXISTS eleicao (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    turma_id        INTEGER NOT NULL REFERENCES turma(id) ON DELETE CASCADE,
    data_eleicao    TEXT NOT NULL,          -- ISO: AAAA-MM-DD
    mandato_inicio  TEXT NOT NULL,
    mandato_fim     TEXT NOT NULL,
    -- Fluxo: rascunho -> aberta -> (professor encerra a votação) aguardando_apuracao
    --        -> (professor inicia a apuração manualmente) apurada
    --        -> segundo_turno (só em caso de empate) -> ata gerada -> apagada
    -- Vale a maioria dos votos computados; eleitores que não votaram não bloqueiam a apuração.
    status          TEXT NOT NULL DEFAULT 'rascunho'
                    CHECK (status IN ('rascunho','aberta','aguardando_apuracao','segundo_turno','apurada','apagada')),
    rodada          INTEGER NOT NULL DEFAULT 1,   -- 1 = primeiro turno; 2 = segundo turno (empate)
    criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Candidatos da eleição (quem se cadastrou como voluntário)
CREATE TABLE IF NOT EXISTS candidato (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    eleicao_id  INTEGER NOT NULL REFERENCES eleicao(id) ON DELETE CASCADE,
    aluno_id    INTEGER NOT NULL REFERENCES aluno(id) ON DELETE CASCADE,
    numero      INTEGER NOT NULL,           -- número usado na urna (como no TSE)
    posicao     INTEGER,                    -- resultado: 1 = titular, 2 a 6 = 1º a 5º suplente (NULL até apurar)
    UNIQUE (eleicao_id, aluno_id),
    UNIQUE (eleicao_id, numero)
);

-- Lista de eleitores da eleição (todos os alunos aptos da turma)
-- Guarda apenas se já votou. NÃO há vínculo com o voto escolhido.
CREATE TABLE IF NOT EXISTS eleitor (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    eleicao_id  INTEGER NOT NULL REFERENCES eleicao(id) ON DELETE CASCADE,
    aluno_id    INTEGER NOT NULL REFERENCES aluno(id) ON DELETE CASCADE,
    ja_votou    INTEGER NOT NULL DEFAULT 0 CHECK (ja_votou IN (0,1)),
    UNIQUE (eleicao_id, aluno_id)
);

-- Votos: sigilo. Não guarda eleitor_id nem aluno_id.
-- candidato_id NULL = voto em branco.
CREATE TABLE IF NOT EXISTS voto (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    eleicao_id   INTEGER NOT NULL REFERENCES eleicao(id) ON DELETE CASCADE,
    rodada       INTEGER NOT NULL DEFAULT 1,
    candidato_id INTEGER REFERENCES candidato(id) ON DELETE CASCADE,
    registrado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_aluno_turma     ON aluno(turma_id);
CREATE INDEX IF NOT EXISTS idx_eleitor_eleicao ON eleitor(eleicao_id, ja_votou);
CREATE INDEX IF NOT EXISTS idx_voto_eleicao    ON voto(eleicao_id, rodada);
