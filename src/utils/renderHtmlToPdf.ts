import puppeteer from "puppeteer";

const PDF_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

/**
 * Render an HTML document to a PDF buffer using Puppeteer (headless Chromium).
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: PDF_ARGS,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
