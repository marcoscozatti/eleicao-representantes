# Eleição de Representantes Estudantis

Urna eletrônica online para eleição de representante e suplentes de uma turma.

## Stack

- **Frontend:** HTML, CSS e JavaScript puro (pasta `public/`).
- **Backend:** Netlify Functions em TypeScript (`netlify/functions/api.ts`).
- **Armazenamento:** Netlify Blobs (persistente, incluído no plano gratuito).

## Publicar no Netlify

1. No Netlify, clique em **Add new site → Import an existing project** e escolha este repositório.
2. Não altere nada na configuração de build: o `netlify.toml` já define a pasta pública e as funções.
3. Em **Site configuration → Environment variables**, adicione:
   - `ADMIN_PASSWORD`: a senha do professor.
4. Faça o deploy. O endereço do site aparece no painel.

## Rotas principais

| Método | Rota | Quem | Função |
| --- | --- | --- | --- |
| POST | `/api/auth/professor` | professor | login do professor |
| POST | `/api/auth/aluno` | aluno | login por matrícula e senha |
| POST | `/api/turmas` | professor | cadastrar turma |
| POST | `/api/alunos` | professor | cadastrar aluno (com foto opcional) |
| POST | `/api/eleicoes` | professor | criar eleição (rascunho) |
| POST | `/api/eleicoes/:id/candidatos` | professor | definir candidato e número |
| POST | `/api/eleicoes/:id/abrir` | professor | abrir votação (copia eleitores da turma) |
| GET | `/api/eleicoes/:id/progresso` | professor | quantos já votaram |
| POST | `/api/eleicoes/:id/encerrar` | professor | encerrar votação |
| GET | `/api/eleicoes/ativa` | aluno | eleição aberta da turma e candidatos |
| POST | `/api/votos` | aluno | registrar voto (um por aluno) |

## Regras

- Um voto por aluno. Os votos são guardados sem vínculo com a matrícula.
- A apuração é feita manualmente pelo professor (etapa 3, ainda não implementada).
- Ao final, a ata em PDF é gerada e os dados da eleição são apagados (etapa 4).

## Pendências

- Apuração, detecção de empate, segundo turno e sorteio de suplentes.
- Geração da ata em PDF no modelo do Senac.
- Apagamento dos dados após a ata.
