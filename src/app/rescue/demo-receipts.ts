import type { ExtractedInvoice, ExtractedItem, UploadKind } from "./rescue-types";

/** Polished invoice rows for hackathon demos (paired with canvas-generated receipt images). */
export const DEMO_POLISHED_INVOICES: Record<
  UploadKind,
  Omit<ExtractedInvoice, "rawExtractedText" | "ignoredNoise">
> = {
  receipt: {
    customerName: "Walk-in Customer",
    date: "2026-05-12",
    items: [
      { name: "Aashirvaad Atta 5kg", quantity: 1, price: 265 },
      { name: "Fortune Sunflower Oil 1L", quantity: 2, price: 170 },
      { name: "India Gate Basmati Rice 1kg", quantity: 1, price: 150 },
      { name: "Tata Salt 1kg", quantity: 2, price: 22 },
      { name: "Red Label Tea 500g", quantity: 1, price: 205 },
      { name: "Surf Excel Matic 2kg", quantity: 1, price: 244 },
    ],
    totalAmount: 1248,
    paymentStatus: "Paid",
    aiConfidence: 97,
    tags: ["Demo Sample", "Printed Receipt", "Retail POS", "High Confidence"],
  },
  handwritten: {
    customerName: "Ramesh Kumar",
    date: "2026-05-10",
    items: [
      { name: "Wheat Atta (chakki)", quantity: 5, price: 42 },
      { name: "Mustard Oil (pouch)", quantity: 2, price: 115 },
      { name: "Toor Dal (arhar)", quantity: 1, price: 130 },
      { name: "Sugar (loose)", quantity: 2, price: 40 },
      { name: "Soap (Lifebuoy)", quantity: 4, price: 22 },
    ],
    totalAmount: 738,
    paymentStatus: "Unpaid",
    aiConfidence: 96,
    tags: ["Demo Sample", "Handwritten Bill", "Kirana Credit", "Needs Review"],
  },
  whatsapp: {
    customerName: "Ananya Sharma",
    date: "2026-05-11",
    items: [
      { name: "Seasonal Veg Basket", quantity: 1, price: 320 },
      { name: "Paneer 500g", quantity: 2, price: 160 },
      { name: "Whole Wheat Bread", quantity: 2, price: 55 },
      { name: "Amul Butter 100g", quantity: 3, price: 58 },
    ],
    totalAmount: 924,
    paymentStatus: "Paid",
    aiConfidence: 95,
    tags: ["Demo Sample", "WhatsApp Order", "UPI Paid", "Chat Screenshot"],
  },
};

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawReceiptBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  startY: number,
  lineHeight: number,
  paddingX: number
): number {
  let y = startY;
  ctx.textAlign = "left";
  for (const line of lines) {
    ctx.fillText(line, paddingX, y);
    y += lineHeight;
  }
  return y;
}

/** Renders a readable PNG that Tesseract can OCR; content aligns roughly with DEMO_POLISHED_INVOICES. */
export function renderDemoReceiptImage(kind: UploadKind): Promise<File> {
  const width = 420;
  const height = 640;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas not supported"));
  }

  ctx.fillStyle = "#faf8f5";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#c4bdb4";
  ctx.strokeRect(8, 8, width - 16, height - 16);

  const pad = 28;
  let y = 42;
  const titleSize = kind === "handwritten" ? 20 : 17;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 ${titleSize}px system-ui, Segoe UI, sans-serif`;
  ctx.textAlign = "center";

  const headers: Record<UploadKind, string[]> = {
    receipt: ["FRESH MART RETAIL", "Shop 12, Sector 18 • GST 09AABCF1234Z1", "Bill #1042    Date 12/05/2026"],
    handwritten: ["SHYAM KIRANA STORE", "Village Road • Ph 98765 43210", "Bill ki copy • 10/05/2026"],
    whatsapp: ["WHATSAPP ORDER SNAPSHOT", "GreenBasket • Confirmed on chat", "Order ref GB-771 • 11/05/2026"],
  };

  for (const h of headers[kind]) {
    ctx.fillText(h, width / 2, y);
    y += 26;
  }

  y += 18;
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();
  y += 28;

  ctx.textAlign = "left";
  const bodyFont =
    kind === "handwritten"
      ? 'italic 15px "Segoe Print", "Bradley Hand", cursive'
      : '14px ui-monospace, Consolas, monospace';
  ctx.font = bodyFont;

  const demo = DEMO_POLISHED_INVOICES[kind];
  const itemLines: string[] = [];

  if (kind === "whatsapp") {
    itemLines.push("Customer: Ananya Sharma");
    itemLines.push("Delivery: Today 6-8 PM");
    itemLines.push("");
    itemLines.push("--- Items ---");
    demo.items.forEach((row: ExtractedItem, i: number) => {
      const lineTotal = row.price * row.quantity;
      itemLines.push(
        `${i + 1}. ${row.name}  x${row.quantity}  Rs ${lineTotal.toFixed(0)}`
      );
    });
    itemLines.push("");
    itemLines.push(`Total Rs ${demo.totalAmount}`);
    itemLines.push("Paid via PhonePe UPI");
  } else {
    itemLines.push(kind === "handwritten" ? "Maal / Items:" : "ITEM                          QTY   AMT");
    itemLines.push("");
    demo.items.forEach((row: ExtractedItem) => {
      const lineTotal = row.price * row.quantity;
      if (kind === "handwritten") {
        itemLines.push(`${row.name} — ${row.quantity} x ${row.price} = ${lineTotal}`);
      } else {
        const name = row.name.slice(0, 22).padEnd(22, " ");
        const qty = String(row.quantity).padStart(3, " ");
        itemLines.push(`${name} ${qty} ${lineTotal.toFixed(0)}`);
      }
    });
    itemLines.push("");
    itemLines.push(`TOTAL DUE / PAID     Rs ${demo.totalAmount}`);
    if (demo.paymentStatus === "Paid") {
      itemLines.push("CARD / UPI OK");
    } else {
      itemLines.push("UDHAAR — PAY WHEN POSSIBLE");
    }
  }

  const maxTextW = width - pad * 2;
  const flattened: string[] = [];
  for (const raw of itemLines) {
    if (!raw) {
      flattened.push("");
      continue;
    }
    const wrapped = wrapLines(ctx, raw, maxTextW);
    flattened.push(...wrapped);
  }

  const lineHeight = kind === "handwritten" ? 22 : 20;
  y = drawReceiptBlock(ctx, flattened, y, lineHeight, pad);

  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.fillStyle = "#444";
  y += 16;
  ctx.fillText("Thank you — visit again", pad, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not create demo image"));
          return;
        }
        const name = `demo-${kind}-receipt.png`;
        resolve(new File([blob], name, { type: "image/png" }));
      },
      "image/png",
      0.92
    );
  });
}

export function demoKindFromFilename(name: string): UploadKind | null {
  const m = name.match(/^demo-(receipt|handwritten|whatsapp)-receipt\.png$/i);
  if (!m) return null;
  return m[1].toLowerCase() as UploadKind;
}

export function mergeDemoPolished(
  ocrInvoice: ExtractedInvoice,
  kind: UploadKind
): ExtractedInvoice {
  const polished = DEMO_POLISHED_INVOICES[kind];
  return {
    ...polished,
    rawExtractedText: ocrInvoice.rawExtractedText,
    ignoredNoise: ocrInvoice.ignoredNoise.length ? ocrInvoice.ignoredNoise : [],
    extractionNote: undefined,
    extractionSource: "demo",
  };
}
