package br.senac.eleicao;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

/**
 * Cadastro de alunos (somente professor). Cada aluno tem matrícula, nome, turma,
 * senha (armazenada como hash) e foto opcional.
 */
@RestController
@RequestMapping("/api/alunos")
public class AlunoController {

    private static final long MAX_FOTO_BYTES = 2 * 1024 * 1024;

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final Sessoes sessoes;
    private final Path fotosDir;

    public AlunoController(JdbcTemplate jdbc, PasswordEncoder encoder, Sessoes sessoes,
                           @Value("${eleicao.fotos-dir}") String fotosDir) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.sessoes = sessoes;
        this.fotosDir = Path.of(fotosDir);
    }

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<?> cadastrar(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam Long turmaId,
            @RequestParam String matricula,
            @RequestParam String nome,
            @RequestParam String senha,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String celular,
            @RequestParam(required = false) MultipartFile foto) throws IOException {

        if (!ehProfessor(auth)) return naoAutorizado();
        if (matricula.isBlank() || nome.isBlank() || senha.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("erro", "Matrícula, nome e senha (mín. 6 caracteres) são obrigatórios"));
        }

        String fotoPath = null;
        if (foto != null && !foto.isEmpty()) {
            if (foto.getSize() > MAX_FOTO_BYTES) {
                return ResponseEntity.badRequest().body(Map.of("erro", "Foto maior que 2 MB"));
            }
            String tipo = foto.getContentType();
            if (tipo == null || !(tipo.equals("image/jpeg") || tipo.equals("image/png") || tipo.equals("image/webp"))) {
                return ResponseEntity.badRequest().body(Map.of("erro", "Foto deve ser JPEG, PNG ou WebP"));
            }
            Files.createDirectories(fotosDir);
            String nomeArquivo = UUID.randomUUID() + extensao(tipo);
            Files.write(fotosDir.resolve(nomeArquivo), foto.getBytes());
            fotoPath = nomeArquivo;
        }

        try {
            jdbc.update("""
                    INSERT INTO aluno (turma_id, matricula, senha_hash, nome, email, celular, foto_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    turmaId, matricula.trim(), encoder.encode(senha), nome.trim(), email, celular, fotoPath);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", "Matrícula já cadastrada"));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("matricula", matricula.trim(), "nome", nome.trim()));
    }

    @GetMapping("/turma/{turmaId}")
    public ResponseEntity<?> listarPorTurma(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long turmaId) {
        if (!ehProfessor(auth)) return naoAutorizado();
        return ResponseEntity.ok(jdbc.queryForList(
                "SELECT id, matricula, nome, email, celular, foto_path FROM aluno WHERE turma_id = ? ORDER BY nome",
                turmaId));
    }

    private boolean ehProfessor(String auth) {
        Sessoes.Sessao s = sessoes.obter(AuthController.extrairToken(auth));
        return s != null && "professor".equals(s.papel());
    }

    private static ResponseEntity<Map<String, String>> naoAutorizado() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("erro", "Acesso restrito ao professor"));
    }

    private static String extensao(String tipo) {
        return switch (tipo) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> ".jpg";
        };
    }
}
