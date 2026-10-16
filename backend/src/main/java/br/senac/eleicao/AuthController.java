package br.senac.eleicao;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final Sessoes sessoes;
    private final String adminPassword;

    public AuthController(JdbcTemplate jdbc, PasswordEncoder encoder, Sessoes sessoes,
                          @Value("${eleicao.admin-password}") String adminPassword) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.sessoes = sessoes;
        this.adminPassword = adminPassword;
    }

    /** Login do professor (administrador). */
    @PostMapping("/professor")
    public ResponseEntity<?> loginProfessor(@RequestBody Map<String, String> body) {
        if (body.get("senha") == null || !body.get("senha").equals(adminPassword)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Senha inválida"));
        }
        return ResponseEntity.ok(Map.of("token", sessoes.criar("professor", null)));
    }

    /** Login do aluno com matrícula e senha. */
    @PostMapping("/aluno")
    public ResponseEntity<?> loginAluno(@RequestBody Map<String, String> body) {
        String matricula = body.getOrDefault("matricula", "").trim();
        String senha = body.getOrDefault("senha", "");

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, senha_hash FROM aluno WHERE matricula = ?", matricula);
        if (rows.isEmpty() || !encoder.matches(senha, (String) rows.get(0).get("senha_hash"))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Matrícula ou senha inválida"));
        }
        Long alunoId = ((Number) rows.get(0).get("id")).longValue();
        return ResponseEntity.ok(Map.of("token", sessoes.criar("aluno", alunoId)));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(value = "Authorization", required = false) String auth) {
        sessoes.remover(extrairToken(auth));
        return ResponseEntity.noContent().build();
    }

    static String extrairToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) return null;
        return authorization.substring(7).trim();
    }
}
