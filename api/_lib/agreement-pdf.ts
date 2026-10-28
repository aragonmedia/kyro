/**
 * KYRO — turning a typed name into a signed document
 *
 * The blank agreements are PDFs exported from a word processor. They carry no
 * form fields, so there is nowhere to type into them: filling one in means
 * guessing at x and y coordinates, and those guesses break silently the first
 * time the document is re-exported with one more line of text in clause 4.
 *
 * So nothing is written into the original. The signed artifact is the
 * original document, byte for byte, with one page appended that KYRO
 * generates. That page carries what was typed, when, by whom, and the
 * SHA-256 of the exact blank document the signer was shown, so the pair can
 * be checked against each other later without trusting either on its own.
 *
 * The hash is of what was fetched from the public URL, which is the same URL
 * the signer's browser rendered. Hashing a copy on the server that the signer
 * never saw would prove only that the server has a file.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/** Letter, matching both templates. */
const WIDTH = 612;
const HEIGHT = 792;
const MARGIN = 64;
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.42, 0.42, 0.47);
const RULE = rgb(0.85, 0.85, 0.88);

export interface SignatureRecord {
  /** The row this page belongs to, so a PDF on someone's desktop is findable. */
  recordId: string;
  documentTitle: string;
  version: string;
  /** Lines of the form [label, value]. Rendered in order. */
  fields: Array<[string, string]>;
  /** The name typed, rendered as the signature. */
  signature: string;
  signedAt: Date;
  templateSha256: string;
  ip: string | null;
  userAgent: string | null;
}

/** Breaks text to a width, since pdf-lib draws exactly what it is given. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

/** The sheet's own date format, written out so nobody has to guess a locale. */
const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function label(page: PDFPage, font: PDFFont, text: string, y: number) {
  page.drawText(text.toUpperCase(), {
    x: MARGIN, y, size: 7.5, font, color: MUTED,
  });
}

/**
 * Append the signature page and return the finished document.
 *
 * `template` is the blank agreement exactly as served. It is loaded, copied
 * and never edited, so every page of the original survives untouched.
 */
export async function buildSignedPdf(template: Uint8Array, record: SignatureRecord): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const hand = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const page = pdf.addPage([WIDTH, HEIGHT]);
  const right = WIDTH - MARGIN;
  let y = HEIGHT - MARGIN;

  page.drawText('Signature page', { x: MARGIN, y, size: 20, font: bold, color: INK });
  y -= 18;

  page.drawText(`${record.documentTitle}  ·  Version ${record.version}`, {
    x: MARGIN, y, size: 9.5, font: body, color: MUTED,
  });
  y -= 10;
  page.drawText('Accepted through KYRO, operated by Kyvo LLC.', {
    x: MARGIN, y, size: 9.5, font: body, color: MUTED,
  });

  y -= 22;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE });
  y -= 28;

  for (const [name, value] of record.fields) {
    label(page, bold, name, y);
    y -= 14;
    page.drawText(value || '—', { x: MARGIN, y, size: 11, font: body, color: INK });
    y -= 22;
  }

  // The signature itself, set apart from the fields above it and drawn on a
  // rule, because that is what a person expects a signature to look like.
  y -= 6;
  label(page, bold, 'Signature, typed by the signer', y);
  y -= 24;
  page.drawText(record.signature, { x: MARGIN + 4, y, size: 19, font: hand, color: INK });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 300, y }, thickness: 0.75, color: RULE });

  y -= 24;
  label(page, bold, 'Date signed', y);
  y -= 14;
  page.drawText(`${isoDay(record.signedAt)}  (${longDate(record.signedAt)} UTC)`, {
    x: MARGIN, y, size: 11, font: body, color: INK,
  });

  y -= 34;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE });
  y -= 20;

  const affirmation =
    'The person named above typed their name as their signature and accepted this document '
    + 'in KYRO. The document they accepted is the one reproduced on the preceding pages, and '
    + 'its SHA-256 is recorded below. A different version of the document produces a different '
    + 'hash and is therefore a separate acceptance.';

  for (const line of wrap(affirmation, body, 9, right - MARGIN)) {
    page.drawText(line, { x: MARGIN, y, size: 9, font: body, color: MUTED });
    y -= 12;
  }

  y -= 14;
  label(page, bold, 'Record', y);
  y -= 14;

  const record_lines: Array<[string, string]> = [
    ['Document SHA-256', record.templateSha256],
    ['Signed at', record.signedAt.toISOString()],
    ['Reference', record.recordId],
    ['Address', record.ip ?? 'not recorded'],
  ];

  for (const [name, value] of record_lines) {
    page.drawText(`${name}:`, { x: MARGIN, y, size: 8, font: body, color: MUTED });
    page.drawText(value, { x: MARGIN + 104, y, size: 8, font: mono, color: INK });
    y -= 12;
  }

  if (record.userAgent) {
    page.drawText('Browser:', { x: MARGIN, y, size: 8, font: body, color: MUTED });
    const lines = wrap(record.userAgent, mono, 8, right - MARGIN - 104);
    for (const [i, line] of lines.slice(0, 2).entries()) {
      page.drawText(line, { x: MARGIN + 104, y: y - i * 10, size: 8, font: mono, color: INK });
    }
    y -= 10 * Math.min(lines.length, 2) + 2;
  }

  page.drawText('KYRO  ·  Operated by Kyvo LLC  ·  131 Continental Drive, Suite 305, Newark, DE 19713', {
    x: MARGIN, y: MARGIN - 18, size: 7.5, font: body, color: MUTED,
  });

  return pdf.save();
}
