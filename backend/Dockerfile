# Build e execução do backend no Render (Docker)
FROM gradle:8.14-jdk21 AS build
WORKDIR /app
COPY . .
RUN gradle installDist --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/install/eleicao-representantes/ ./
ENV DB_PATH=/data/eleicao.db FOTOS_DIR=/data/fotos PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/bin/eleicao-representantes"]
