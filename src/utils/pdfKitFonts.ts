import path from "node:path";

import PDFDocument from "pdfkit";

const fontsDir = path.resolve(process.cwd(), "assets/fonts");

export const PDF_FONT = "NotoSans";
export const PDF_FONT_BOLD = "NotoSans-Bold";

export type PdfDoc = InstanceType<typeof PDFDocument>;

export function createPdfDocument(options?: PDFKit.PDFDocumentOptions): PdfDoc {
  const doc = new PDFDocument(options ?? { size: "A4", margin: 48 });
  doc.registerFont(PDF_FONT, path.join(fontsDir, "NotoSans-Regular.ttf"));
  doc.registerFont(PDF_FONT_BOLD, path.join(fontsDir, "NotoSans-Bold.ttf"));
  return doc;
}
