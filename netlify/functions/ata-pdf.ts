// Geração da ata da eleição em PDF (pdf-lib). Recebe os dados já prontos e devolve os bytes do arquivo.
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

// Cores da identidade visual do Senac
const AZUL = rgb(0 / 255, 74 / 255, 141 / 255);       // #004A8D
const LARANJA = rgb(247 / 255, 148 / 255, 29 / 255);  // #F7941D
const CLARO = rgb(0.93, 0.95, 0.98);
const PRETO = rgb(0.1, 0.1, 0.1);
const CINZA = rgb(0.4, 0.4, 0.4);
const BRANCO = rgb(1, 1, 1);

const LARGURA = 595; // A4
const ALTURA = 842;
const MARGEM = 50;
const LARGURA_UTIL = LARGURA - 2 * MARGEM;

export type DadosAta = {
  turma: string;
  dataEleicao: string;     // AAAA-MM-DD
  mandatoInicio: string;   // AAAA-MM-DD
  mandatoFim: string;      // AAAA-MM-DD
  eleitores: number;
  rodadas: { rodada: number; votos: number; brancos: number; contagem: Record<number, number> }[];
  candidatos: { numero: number; nome: string }[];
  eleito: { numero: number; nome: string } | null;
  desempatadoPorSorteio: boolean;
  suplentes: { ordem: number; numero: number; nome: string; votos: number }[];
  desempateSuplentesPorSorteio: boolean;
  geradaEm: string;
};

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

// Quebra um texto em linhas que cabem na largura dada
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  // Só quebra em espaços comuns; o espaço não separável em "nº 13" fica junto
  for (const palavra of texto.split(/ +/)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(teste, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// Corta o texto com reticências se não couber na largura
function encurtar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let s = texto;
  while (s.length > 1 && fonte.widthOfTextAtSize(s + "…", tamanho) > largura) s = s.slice(0, -1);
  return s + "…";
}

export async function gerarAta(d: DadosAta): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  let pagina = doc.addPage([LARGURA, ALTURA]);
  let y = ALTURA - 130;

  // Faixa de cabeçalho (primeira página)
  pagina.drawRectangle({ x: 0, y: ALTURA - 96, width: LARGURA, height: 96, color: AZUL });
  pagina.drawRectangle({ x: 0, y: ALTURA - 100, width: LARGURA, height: 4, color: LARANJA });
  pagina.drawText("SENAC · ELEIÇÃO DE REPRESENTANTES", { x: MARGEM, y: ALTURA - 34, size: 9, font: normal, color: BRANCO });
  pagina.drawText("Ata da eleição de representantes e suplentes", { x: MARGEM, y: ALTURA - 62, size: 17, font: negrito, color: BRANCO });

  const novaPagina = () => {
    pagina = doc.addPage([LARGURA, ALTURA]);
    y = ALTURA - 60;
  };
  const garantir = (altura: number) => {
    if (y - altura < 70) novaPagina();
  };

  const texto = (conteudo: string, opcoes: { tamanho?: number; fonte?: PDFFont; cor?: typeof PRETO } = {}) => {
    const tamanho = opcoes.tamanho ?? 11;
    const fonte = opcoes.fonte ?? normal;
    for (const linha of quebrar(conteudo, fonte, tamanho, LARGURA_UTIL)) {
      garantir(tamanho + 5);
      pagina.drawText(linha, { x: MARGEM, y: y - tamanho, size: tamanho, font: fonte, color: opcoes.cor ?? PRETO });
      y -= tamanho + 5;
    }
  };

  const titulo = (conteudo: string) => {
    y -= 12;
    garantir(30);
    texto(conteudo, { tamanho: 13, fonte: negrito, cor: AZUL });
    y -= 2;
  };

  // Dados gerais
  texto(`Turma: ${d.turma}`, { fonte: negrito });
  texto(`Data da eleição: ${dataBr(d.dataEleicao)}`);
  texto(`Período do mandato: ${dataBr(d.mandatoInicio)} a ${dataBr(d.mandatoFim)}`);
  texto(`Eleitores aptos: ${d.eleitores}`);
  d.rodadas.forEach((r, i) => {
    texto(`Votantes no ${i + 1}º turno: ${r.votos}`);
  });

  // Tabela da apuração
  const r1 = d.rodadas[0]!;
  const r2 = d.rodadas[1];
  const totalValidos = (r: { contagem: Record<number, number> }) => Object.values(r.contagem).reduce((a, b) => a + b, 0);

  titulo("Apuração");
  const nomeLargura = LARGURA_UTIL - 45 - 90 * (r2 ? 2 : 1);
  const colunas = [
    { titulo: "Nº", largura: 45, direita: false },
    { titulo: "Candidato", largura: nomeLargura, direita: false },
    { titulo: "1º turno", largura: 90, direita: true },
    ...(r2 ? [{ titulo: "2º turno", largura: 90, direita: true }] : []),
  ];

  const linha = (valores: string[], opcoes: { fundo?: typeof CLARO; negrito?: boolean } = {}) => {
    garantir(18);
    if (opcoes.fundo) pagina.drawRectangle({ x: MARGEM, y: y - 18, width: LARGURA_UTIL, height: 18, color: opcoes.fundo });
    const fonte = opcoes.negrito ? negrito : normal;
    let x = MARGEM;
    colunas.forEach((c, i) => {
      const t = encurtar(valores[i] ?? "", fonte, 10, c.largura - 12);
      const tx = c.direita ? x + c.largura - 6 - fonte.widthOfTextAtSize(t, 10) : x + 6;
      pagina.drawText(t, { x: tx, y: y - 13, size: 10, font: fonte, color: PRETO });
      x += c.largura;
    });
    y -= 18;
  };

  linha(colunas.map((c) => c.titulo), { fundo: CLARO, negrito: true });
  for (const c of [...d.candidatos].sort((a, b) => a.numero - b.numero)) {
    linha([
      String(c.numero).padStart(2, "0"),
      c.nome,
      String(r1.contagem[c.numero] ?? 0),
      ...(r2 ? [r2.contagem[c.numero] !== undefined ? String(r2.contagem[c.numero]) : "—"] : []),
    ]);
  }
  linha(["", "Votos em branco", String(r1.brancos), ...(r2 ? [String(r2.brancos)] : [])]);
  linha(["", "Total de votos válidos", String(totalValidos(r1)), ...(r2 ? [String(totalValidos(r2))] : [])], { fundo: CLARO, negrito: true });

  // Resultado
  titulo("Resultado");
  if (d.eleito) {
    texto(`Representante eleito(a): ${d.eleito.nome} (nº ${d.eleito.numero}).`, { fonte: negrito });
    if (d.desempatadoPorSorteio) texto("O empate no segundo turno foi resolvido por sorteio.");
  } else {
    texto("Não houve representante eleito, pois nenhum voto válido foi registrado.");
  }
  if (r2) {
    const nomes = d.candidatos
      .filter((c) => r2.contagem[c.numero] !== undefined)
      .map((c) => `${c.nome} (nº ${c.numero})`)
      .join(", ");
    texto(`Houve segundo turno entre os candidatos empatados: ${nomes}.`);
  }

  // Suplentes
  titulo("Suplentes");
  if (d.suplentes.length === 0) {
    texto("Nenhum suplente.");
  }
  for (const s of d.suplentes) {
    texto(`${s.ordem}º suplente: ${s.nome} (nº ${s.numero}), ${s.votos} voto(s).`);
  }
  if (d.desempateSuplentesPorSorteio) {
    texto("Houve empate entre suplentes; a ordem entre eles foi definida por sorteio.");
  }

  // Assinaturas
  y -= 40;
  garantir(40);
  const assinatura = (x: number, legenda: string) => {
    pagina.drawLine({ start: { x, y: y }, end: { x: x + 200, y: y }, thickness: 0.8, color: PRETO });
    pagina.drawText(legenda, { x, y: y - 14, size: 10, font: normal, color: CINZA });
  };
  assinatura(MARGEM, "Professor(a) responsável");
  assinatura(LARGURA - MARGEM - 200, "Representante eleito(a)");

  // Rodapé em todas as páginas
  for (const p of doc.getPages()) {
    p.drawText(`Gerada em ${d.geradaEm}`, { x: MARGEM, y: 30, size: 8, font: normal, color: CINZA });
  }

  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
