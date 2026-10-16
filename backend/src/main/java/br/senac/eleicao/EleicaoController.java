package br.senac.eleicao;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Ciclo da eleição controlado pelo professor:
 * rascunho -> aberta (votação) -> aguardando_apuracao (encerrada) -> apurada
 * A apuração em si é a etapa 3.
 */
@RestController
@RequestMapping("/api/eleicoes")
public class EleicaoController {

    private final JdbcTemplate jdbc;
    private final Sessoes sessoes;

    public EleicaoController(JdbcTemplate jdbc, Sessoes sessoes) {
        this.jdbc = jdbc;
        this.sessoes = sessoes;
    }

    @PostMapping
    public ResponseEntity<?> criar(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        if (!ehProfessor(auth)) return naoAutorizado();

        jdbc.update("""
                INSERT INTO eleicao (turma_id, data_eleicao, mandato_inicio, mandato_fim)
                VALUES (?, ?, ?, ?)
                """,
                body.get("turmaId"), body.get("dataEleicao"), body.get("mandatoInicio"), body.get("mandatoFim"));

        Long id = jdbc.queryForObject("SELECT last_insert_rowid()", Long.class);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id, "status", "rascunho"));
    }

    /** Abre a votação: copia os alunos da turma para a lista de eleitores. */
    @PostMapping("/{id}/abrir")
    public ResponseEntity<?> abrir(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        if (!ehProfessor(auth)) return naoAutorizado();

        String status = statusDe(id);
        if (status == null) return naoEncontrada();
        if (!"rascunho".equals(status)) {
            return conflito("A eleição só pode ser aberta a partir do rascunho");
        }

        jdbc.update("""
                INSERT INTO eleitor (eleicao_id, aluno_id)
                SELECT ?, a.id FROM aluno a
                JOIN eleicao e ON e.turma_id = a.turma_id
                WHERE e.id = ?
                """, id, id);
        jdbc.update("UPDATE eleicao SET status = 'aberta' WHERE id = ?", id);
        return ResponseEntity.ok(Map.of("id", id, "status", "aberta"));
    }

    /** Encerra a votação. A apuração só acontece quando o professor a iniciar. */
    @PostMapping("/{id}/encerrar")
    public ResponseEntity<?> encerrar(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        if (!ehProfessor(auth)) return naoAutorizado();

        String status = statusDe(id);
        if (status == null) return naoEncontrada();
        if (!"aberta".equals(status)) {
            return conflito("Só é possível encerrar uma eleição aberta");
        }
        jdbc.update("UPDATE eleicao SET status = 'aguardando_apuracao' WHERE id = ?", id);
        return ResponseEntity.ok(Map.of("id", id, "status", "aguardando_apuracao"));
    }

    /** Progresso da votação: quantos já votaram e quantos eleitores existem. */
    @GetMapping("/{id}/progresso")
    public ResponseEntity<?> progresso(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        if (!ehProfessor(auth)) return naoAutorizado();

        Map<String, Object> r = jdbc.queryForMap("""
                SELECT COUNT(*) AS total, COALESCE(SUM(ja_votou), 0) AS votaram
                FROM eleitor WHERE eleicao_id = ?
                """, id);
        return ResponseEntity.ok(r);
    }

    private String statusDe(Long id) {
        var rows = jdbc.queryForList("SELECT status FROM eleicao WHERE id = ?", id);
        return rows.isEmpty() ? null : (String) rows.get(0).get("status");
    }

    private boolean ehProfessor(String auth) {
        Sessoes.Sessao s = sessoes.obter(AuthController.extrairToken(auth));
        return s != null && "professor".equals(s.papel());
    }

    private static ResponseEntity<Map<String, String>> naoAutorizado() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Acesso restrito ao professor"));
    }

    private static ResponseEntity<Map<String, String>> naoEncontrada() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("erro", "Eleição não encontrada"));
    }

    private static ResponseEntity<Map<String, String>> conflito(String msg) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", msg));
    }
}
