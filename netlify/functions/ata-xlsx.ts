// Ata da eleição preenchida no modelo oficial (planilha .xlsx).
// O modelo é mantido como está: só os valores são preenchidos, sem mexer no desenho.
import { Workbook, type Cell } from "exceljs";
import { MODELO_ATA_B64 } from "./modelo-ata";

export type Contato = { nome: string; celular: string; email: string };

export type DadosAtaXlsx = {
  dataEleicao: string;     // AAAA-MM-DD
  mandatoInicio: string;   // AAAA-MM-DD
  mandatoFim: string;      // AAAA-MM-DD
  curso: string;
  turma: string;
  oferta: string;
  horario: string;
  titular: Contato | null;
  suplentes: Contato[];    // até 5, na ordem
  assinantes: string[];    // nomes dos eleitores, na ordem da lista de assinatura
};

const FORMATO_DATA = "dd/mm/yyyy";

// Data ISO vira data do Excel (meio-dia, para não cair no dia anterior por fuso)
const data = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : null);

function definirData(celula: Cell, iso: string) {
  const valor = data(iso);
  celula.value = valor;
  celula.numFmt = FORMATO_DATA;
}

export async function gerarAtaXlsx(d: DadosAtaXlsx): Promise<ArrayBuffer> {
  const wb = new Workbook();
  // Tipos do exceljs são de uma versão antiga do Node; o conteúdo é um .xlsx normal
  await wb.xlsx.load(Buffer.from(MODELO_ATA_B64, "base64") as any);
  const ws = wb.worksheets[0]!;

  // Cabeçalho
  definirData(ws.getCell("I4"), d.dataEleicao);
  ws.getCell("C5").value = d.curso;
  ws.getCell("I5").value = d.turma;
  ws.getCell("C6").value = d.oferta;
  ws.getCell("G6").value = d.horario;
  ws.getCell("B7").value = `Período do mandato:  ${d.horario}`;
  definirData(ws.getCell("F7"), d.mandatoInicio);
  definirData(ws.getCell("I7"), d.mandatoFim);

  // Titular e suplentes (linhas 11 a 16)
  const linhas = [d.titular, ...d.suplentes];
  for (let i = 0; i < 6; i++) {
    const r = 11 + i;
    const c = linhas[i];
    ws.getCell(`C${r}`).value = c?.nome ?? null;
    ws.getCell(`G${r}`).value = c?.celular || null;
    ws.getCell(`I${r}`).value = c?.email || null;
  }

  // Lista de assinaturas (a partir da linha 20): nome preenchido, coluna de assinatura em branco
  const primeira = 20;
  const modelo = 33; // última linha numerada do modelo
  const total = d.assinantes.length;
  for (let i = 0; i < Math.max(total, 14); i++) {
    const r = primeira + i;
    if (r > 34) {
      // Linha além do modelo: copia o estilo da última linha e junta as mesmas células
      for (let col = 1; col <= 11; col++) {
        ws.getRow(r).getCell(col).style = { ...ws.getRow(modelo).getCell(col).style };
      }
      ws.getRow(r).height = ws.getRow(modelo).height;
      ws.mergeCells(`C${r}:E${r}`);
      ws.mergeCells(`G${r}:K${r}`);
    }
    ws.getCell(`B${r}`).value = i < total ? i + 1 : null;
    ws.getCell(`C${r}`).value = i < total ? d.assinantes[i] : null;
  }

  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;

  const buffer = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
