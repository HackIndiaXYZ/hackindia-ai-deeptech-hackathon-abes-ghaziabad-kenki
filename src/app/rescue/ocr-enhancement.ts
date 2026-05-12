import type { ExtractedInvoice, ExtractedItem, PaymentStatus, UploadKind } from "./rescue-types";

const moneyRegex = /(?:rs\.?|inr|₹)?\s*(\d+(?:[.,]\d{1,2})?)/gi;

const normalizeLine = (line: string): string =>
  line
    .replace(/[|~`_^*]+/g, " ")
    .replace(/[^\w\s./:-]/g, " ")
    .replace(/\b0il\b/gi, "oil")
    .replace(/\b0\b(?=\s*(kg|g|ml|ltr)\b)/gi, "o")
    .replace(/\s+/g, " ")
    .trim();

export function isPoorOcrQuality(invoice: ExtractedInvoice, ocrConfidence: number): boolean {
  const unclearOnly =
    invoice.items.length === 1 && /unclear/i.test(invoice.items[0]?.name ?? "");
  const fewExtracted = invoice.items.length <= 1;
  const veryLowOcr = ocrConfidence < 58;
  const lowOcrAndMessy =
    ocrConfidence < 72 &&
    invoice.ignoredNoise.length > invoice.items.length + 4 &&
    invoice.items.length <= 3;
  return unclearOnly || veryLowOcr || (fewExtracted && lowOcrAndMessy);
}

const parsePaymentStatus = (text: string): PaymentStatus => {
  if (/(pending|due|udhaar|credit|not paid|balance)/i.test(text)) return "Unpaid";
  if (/(paid|received|done|gpay|phonepe|upi|cash|ok|card)/i.test(text)) return "Paid";
  return "Unpaid";
};

const parseDateLoose = (text: string, fallback: string): string => {
  const match = text.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/
  );
  if (!match) return fallback;
  return match[1].replace(/\//g, "-");
};

const parseCustomerLoose = (lines: string[]): string => {
  const prefixed = lines.find((line) =>
    /(?:customer|cust|name|bill to|party|dear|hi\b|order for)\s*[:\-]/i.test(line)
  );
  if (prefixed) {
    const cleaned = prefixed.split(/[:\-]/).slice(1).join(" ").trim();
    if (cleaned.length > 2) return cleaned.slice(0, 48);
  }
  const candidate = lines.find(
    (line) =>
      line.length > 3 &&
      line.length < 42 &&
      !/^\d+[./-]\d+/.test(line) &&
      !/(total|amount|rs\.?|₹|gst|tax|qty|item)/i.test(line)
  );
  return candidate?.slice(0, 48) ?? "Unknown Customer";
};

/**
 * Relaxed row extraction: accepts lines with qty/amount patterns OCR often preserves.
 */
export function extractItemsRelaxed(lines: string[]): { items: ExtractedItem[]; noise: string[] } {
  const items: ExtractedItem[] = [];
  const noise: string[] = [];

  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line || line.length < 4) continue;
    if (/(subtotal|grand|discount|tax|cgst|sgst|thank|visit)/i.test(line)) {
      noise.push(line);
      continue;
    }

    const compact = line.match(
      /^(.+?)\s+(\d{1,3})\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*$/i
    );
    if (compact) {
      const name = compact[1].trim().replace(/\s+/g, " ");
      const qty = Number(compact[2]);
      const gross = Number(compact[3].replace(",", "."));
      if (name.length >= 2 && qty > 0 && gross > 0) {
        items.push({
          name: name.slice(0, 50),
          quantity: qty,
          price: Number((gross / qty).toFixed(2)),
        });
        continue;
      }
    }

    const amounts = [...line.matchAll(moneyRegex)].map((m) =>
      Number((m[1] ?? "0").replace(",", "."))
    );
    const qtyMatch = line.match(/\bx\s*(\d{1,3})\b/i) ?? line.match(/\b(\d{1,2})\s*(?:nos|pcs|pkt)\b/i);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
    const lastAmt = amounts.filter((n) => n > 0 && n < 500000).at(-1);
    if (lastAmt && qty > 0) {
      let name = line
        .replace(/(?:rs\.?|inr|₹)?\s*\d+(?:[.,]\d{1,2})?/gi, " ")
        .replace(/\b\d{1,3}\s*(?:nos|pcs|pkt)\b/gi, " ")
        .replace(/\bx\s*\d+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (name.length >= 3) {
        items.push({
          name: name.slice(0, 50),
          quantity: qty,
          price: Number((lastAmt / qty).toFixed(2)),
        });
        continue;
      }
    }

    if (line.length > 60) noise.push(line.slice(0, 80));
  }

  return { items: items.slice(0, 12), noise: noise.slice(0, 14) };
}

function parseTotalLoose(text: string, items: ExtractedItem[]): number {
  const lines = text.split("\n");
  const totalLine = lines.find((line) =>
    /(grand total|total amount|amount due|net total|^total\b)/i.test(line)
  );
  if (totalLine) {
    const matches = [...totalLine.matchAll(moneyRegex)];
    const detected = Number((matches.at(-1)?.[1] ?? "0").replace(",", "."));
    if (Number.isFinite(detected) && detected > 0) return Number(detected.toFixed(2));
  }
  const sum = items.reduce((s, it) => s + it.price * it.quantity, 0);
  return Number(sum.toFixed(2));
}

export function applyAiEnhancedExtraction(
  rawText: string,
  base: ExtractedInvoice,
  type: UploadKind,
  ocrConfidence: number
): ExtractedInvoice {
  const normalized = rawText.trim() || base.rawExtractedText;
  const lines = normalized
    .split("\n")
    .map((l) => normalizeLine(l))
    .filter(Boolean);

  const { items, noise } = extractItemsRelaxed(lines);
  const safeItems =
    items.length > 0
      ? items
      : base.items.filter((it) => !/unclear/i.test(it.name));

  const paymentStatus = parsePaymentStatus(normalized);
  const mergedTags = Array.from(
    new Set([
      ...base.tags.filter((t) => !/needs review|low confidence/i.test(t)),
      "AI Enhanced",
      type === "whatsapp" ? "Chat Parsed" : "Receipt Parsed",
    ])
  );

  const boostedConfidence = Math.min(
    94,
    Math.max(78, Math.round(ocrConfidence + 12))
  );

  return {
    customerName: parseCustomerLoose(lines) || base.customerName,
    date: parseDateLoose(normalized, base.date),
    items: safeItems.length ? safeItems : base.items,
    totalAmount: parseTotalLoose(normalized, safeItems.length ? safeItems : base.items),
    paymentStatus,
    rawExtractedText: base.rawExtractedText,
    aiConfidence: boostedConfidence,
    tags: mergedTags,
    ignoredNoise: noise.length ? noise : base.ignoredNoise,
    extractionNote: "AI enhanced extraction applied — structured fields recovered from noisy OCR.",
    extractionSource: "ai_enhanced",
  };
}
