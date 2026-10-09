import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { parceiroPorCodigo } from "@/lib/indicacoes/publico";
import { linkParceiro } from "@/lib/indicacoes/divulgacao";
import { hexParaRgb } from "@/components/Marca";

/**
 * QR Code do link pessoal do parceiro (/i/[codigo]) em PNG ou PDF (cartão
 * para imprimir). O link é público por natureza; só parceiros ativos.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const dados = await parceiroPorCodigo(codigo);
  if (!dados || dados.parceiro.status !== "ativo") return new NextResponse("Link indisponível", { status: 404 });
  const link = linkParceiro(env.appUrl(), dados.parceiro.codigo_indicacao);
  const formato = request.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "png";
  const nomeArquivo = `qr-indicacao-${dados.parceiro.codigo_indicacao}`;

  const png = await QRCode.toBuffer(link, { width: 800, margin: 2, errorCorrectionLevel: "M" });
  if (formato === "png") {
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${nomeArquivo}.png"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // PDF A6 (cartão) com nome do espaço, do parceiro, QR e link
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([298, 420]);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [r, g, b] = hexParaRgb(dados.espaco.cor_primaria).split(" ").map((n) => Number(n) / 255);
  pagina.drawRectangle({ x: 0, y: 360, width: 298, height: 60, color: rgb(r, g, b) });
  const centro = (texto: string, f: typeof fonte, tamanho: number, y: number, cor = rgb(0.1, 0.1, 0.1)) => {
    const limpo = texto.normalize("NFC").replace(/[^\x20-\xFF]/g, ""); // fonte padrão = WinAnsi
    const largura = f.widthOfTextAtSize(limpo, tamanho);
    pagina.drawText(limpo, { x: (298 - largura) / 2, y, size: tamanho, font: f, color: cor });
  };
  centro(dados.espaco.nome.slice(0, 32), negrito, 16, 384, rgb(1, 1, 1));
  centro("Aponte a câmera e deixe seu contato", fonte, 11, 335);
  const imagem = await pdf.embedPng(png);
  pagina.drawImage(imagem, { x: 49, y: 120, width: 200, height: 200 });
  centro(`Indicação de ${dados.parceiro.nome}`.slice(0, 40), negrito, 12, 95);
  centro(link.replace(/^https?:\/\//, ""), fonte, 9, 75, rgb(0.3, 0.3, 0.3));
  const bytes = await pdf.save();
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomeArquivo}.pdf"` },
  });
}
