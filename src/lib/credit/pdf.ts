"use client";
import type { TextItem } from "./types";

/**
 * Read a PDF in the browser into positioned text. The file never leaves the device — parsing happens here, and only
 * the parsed, SSN-free result is saved with the home.
 */
export async function pdfToItems(file: File): Promise<TextItem[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  // Text only: no font rendering, no font fetches that could stall.
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, standardFontDataUrl: "/pdfjs/standard_fonts/", useSystemFonts: false }).promise;
  const pages: TextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of tc.items) if ("str" in it) items.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    pages.push(items);
  }
  return pages;
}

/** Which bureau printed this? (Only TransUnion is parsed today; the others are recognized so we can say so.) */
export function detectBureau(pages: TextItem[][]): "TransUnion" | "Equifax" | "Experian" | null {
  const head = pages[0]?.map((i) => i.s).join(" ") ?? "";
  if (/TransUnion/i.test(head)) return "TransUnion";
  if (/Equifax/i.test(head)) return "Equifax";
  if (/Experian/i.test(head)) return "Experian";
  return null;
}
