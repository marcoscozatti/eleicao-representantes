package br.senac.eleicao;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sessões em memória. Um token é emitido no login e enviado no header Authorization.
 * Aceitável para uma eleição pontual: se o serviço reiniciar, basta logar de novo.
 */
@Component
public class Sessoes {

    public record Sessao(String papel, Long alunoId) {}

    private final Map<String, Sessao> sessoes = new ConcurrentHashMap<>();

    public String criar(String papel, Long alunoId) {
        String token = UUID.randomUUID().toString();
        sessoes.put(token, new Sessao(papel, alunoId));
        return token;
    }

    public Sessao obter(String token) {
        return token == null ? null : sessoes.get(token);
    }

    public void remover(String token) {
        if (token != null) sessoes.remove(token);
    }
}
