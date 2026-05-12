"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  demoKindFromFilename,
  mergeDemoPolished,
  renderDemoReceiptImage,
} from "./demo-receipts";
import { downloadInvoicePdf } from "./download-invoice-pdf";
import { applyAiEnhancedExtraction, isPoorOcrQuality } from "./ocr-enhancement";
import type {
  ExtractedInvoice,
  ExtractedItem,
  PaymentStatus,
  UploadKind,
} from "./rescue-types";

type UploadSlot = {
  id: UploadKind;
  label: string;
  helper: string;
};

const uploadSlots: UploadSlot[] = [
  {
    id: "receipt",
    label: "Receipt Image",
    helper: "Upload printed receipts or POS slips",
  },
  {
    id: "handwritten",
    label: "Handwritten Bill",
    helper: "Upload handwritten notes or invoice pages",
  },
  {
    id: "whatsapp",
    label: "WhatsApp Screenshot",
    helper: "Upload chat screenshot with order details",
  },
];

const processingSteps = [
  "Uploading image...",
  "Running OCR scan...",
  "Detecting text blocks...",
  "Extracting purchase data...",
  "Structuring invoice...",
  "Finalizing report...",
];

const fallbackInvoice: ExtractedInvoice = {
  customerName: "Unknown Customer",
  date: new Date().toISOString().split("T")[0],
  items: [{ name: "Unclear item", quantity: 1, price: 0 }],
  totalAmount: 0,
  paymentStatus: "Unpaid",
  rawExtractedText: "",
  aiConfidence: 75,
  tags: ["Low Confidence"],
  ignoredNoise: [],
};

const moneyRegex = /(?:rs\.?|inr|₹)?\s*(\d+(?:[.,]\d{1,2})?)/gi;
const blockedLineRegex =
  /(mob|phone|address|gst|invoice|date|time|cashier|mumbai|\bpin\b|\bpincode\b)/i;
const productHintsRegex =
  /(atta|oil|rice|salt|milk|sugar|tea|soap|biscuit|masala|dal|paneer|cup|tissue|packet|kg|g|ml|ltr|pcs|nos|dozen|chutney|flour)/i;

const pickPrimaryFile = (
  selectedFiles: Partial<Record<UploadKind, File>>
): { type: UploadKind; file: File } | null => {
  if (selectedFiles.whatsapp) return { type: "whatsapp", file: selectedFiles.whatsapp };
  if (selectedFiles.handwritten) return { type: "handwritten", file: selectedFiles.handwritten };
  if (selectedFiles.receipt) return { type: "receipt", file: selectedFiles.receipt };
  return null;
};

const parseDate = (text: string): string => {
  const match = text.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/
  );
  if (!match) return fallbackInvoice.date;
  return match[1].replace(/\//g, "-");
};

const parseCustomerName = (lines: string[]): string => {
  const prefixed = lines.find((line) =>
    /(?:customer|cust|name|bill to|party)\s*[:\-]/i.test(line)
  );
  if (prefixed) {
    const cleaned = prefixed.split(/[:\-]/).slice(1).join(" ").trim();
    if (cleaned.length > 2) return cleaned;
  }

  const likelyHeader = lines.find(
    (line) =>
      line.length > 4 &&
      line.length < 40 &&
      !/\d{2,}/.test(line) &&
      !/(invoice|bill|gst|tax|phone|mob|total|qty|amount)/i.test(line)
  );
  return likelyHeader ?? fallbackInvoice.customerName;
};

const normalizeLine = (line: string): string =>
  line
    .replace(/[|~`_^*]+/g, " ")
    .replace(/[^\w\s./:-]/g, " ")
    .replace(/\b0il\b/gi, "oil")
    .replace(/\b0\b(?=\s*(kg|g|ml|ltr)\b)/gi, "o")
    .replace(/\s+/g, " ")
    .trim();

const isLikelyNoiseLine = (line: string): boolean => {
  if (!line) return true;
  if (blockedLineRegex.test(line)) return true;
  if (/\b\d{8,}\b/.test(line)) return true;
  if (/\b\d{6}\b/.test(line)) return true;
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(line)) return true;
  return false;
};

const parseItemsAndNoise = (
  lines: string[]
): { items: ExtractedItem[]; noiseLines: string[] } => {
  const items: ExtractedItem[] = [];
  const noiseLines: string[] = [];

  lines.forEach((rawLine) => {
    const line = normalizeLine(rawLine);

    if (
      /(total|subtotal|grand|discount|tax|cgst|sgst|balance|amount due|net total)/i.test(
        line
      )
    ) {
      noiseLines.push(line);
      return;
    }
    if (isLikelyNoiseLine(line)) {
      noiseLines.push(line);
      return;
    }

    // Pattern like: "Fortune Oil 2 155" or "Aashirvaad Atta 1 275"
    const compactItemPattern = line.match(/^(.+?)\s+(\d{1,2})\s+(\d{1,5}(?:[.,]\d{1,2})?)$/i);
    let quantity = 0;
    let lineAmount = 0;
    let name = "";

    if (compactItemPattern) {
      name = compactItemPattern[1].trim();
      quantity = Number(compactItemPattern[2]);
      lineAmount = Number(compactItemPattern[3].replace(",", "."));
    } else {
      const qtyMatch = line.match(/(?:\bqty\b[:\-]?\s*|x\s*|^|\s)(\d{1,2})(?:\s*x|\s*(?:nos?|pcs?))?/i);
      const amountMatches = [...line.matchAll(moneyRegex)];
      if (!qtyMatch || amountMatches.length === 0) {
        noiseLines.push(line);
        return;
      }
      quantity = Number(qtyMatch[1]);
      lineAmount = Number((amountMatches.at(-1)?.[1] ?? "0").replace(",", "."));
      name = line
        .replace(/(?:rs\.?|inr|₹)?\s*\d+(?:[.,]\d{1,2})?/gi, "")
        .replace(/\bqty\b[:\-]?\s*\d+/gi, "")
        .replace(/\b\d+\s*(?:nos?|pcs?|x)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      noiseLines.push(line);
      return;
    }
    if (!Number.isFinite(lineAmount) || lineAmount <= 0) {
      noiseLines.push(line);
      return;
    }
    if (name.length < 3 || !productHintsRegex.test(name)) {
      noiseLines.push(line);
      return;
    }

    const unitPrice = Number((lineAmount / quantity).toFixed(2));

    items.push({
      name: name.slice(0, 45),
      quantity,
      price: unitPrice,
    });
  });

  return { items: items.slice(0, 8), noiseLines: noiseLines.slice(0, 12) };
};

const parseTotal = (text: string, items: ExtractedItem[]): number => {
  const totalLine = text
    .split("\n")
    .find((line) => /(grand total|total amount|amount due|net total|total)/i.test(line));

  if (totalLine) {
    const matches = [...totalLine.matchAll(moneyRegex)];
    const detected = Number((matches.at(-1)?.[1] ?? "0").replace(",", "."));
    if (Number.isFinite(detected) && detected > 0) return Number(detected.toFixed(2));
  }

  const itemSum = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Number(itemSum.toFixed(2));
};

const parsePaymentStatus = (text: string): PaymentStatus => {
  if (/(pending|due|udhaar|credit|not paid|balance)/i.test(text)) return "Unpaid";
  if (/(paid|received|done|gpay|phonepe|upi|cash)/i.test(text)) return "Paid";
  return "Unpaid";
};

const buildTags = (type: UploadKind, status: PaymentStatus, confidence: number): string[] => {
  const byType: Record<UploadKind, string[]> = {
    receipt: ["Receipt Image", "Retail Bill"],
    handwritten: ["Handwritten Bill", "Manual Entry"],
    whatsapp: ["WhatsApp Order", "Chat Screenshot"],
  };
  const qualityTag = confidence >= 90 ? "High OCR Confidence" : "Needs Review";
  return [
    ...byType[type],
    status === "Paid" ? "Payment Confirmed" : "Payment Pending",
    qualityTag,
  ];
};

const buildInvoiceFromOcr = (
  rawText: string,
  type: UploadKind,
  confidence: number
): ExtractedInvoice => {
  const normalizedText = rawText.trim() || "No readable text detected from image.";
  const lines = normalizedText
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const { items, noiseLines } = parseItemsAndNoise(lines);
  const safeItems = items.length ? items : fallbackInvoice.items;
  const paymentStatus = parsePaymentStatus(normalizedText);
  const lowConfidence =
    items.length <= 1 ||
    noiseLines.length > items.length + 2 ||
    confidence < 80;

  return {
    customerName: parseCustomerName(lines),
    date: parseDate(normalizedText),
    items: safeItems,
    totalAmount: parseTotal(normalizedText, safeItems),
    paymentStatus,
    rawExtractedText: normalizedText,
    aiConfidence: Math.max(
      68,
      Math.min(99, Math.round(lowConfidence ? confidence - 6 : confidence))
    ),
    tags: buildTags(type, paymentStatus, confidence),
    ignoredNoise: noiseLines,
    extractionSource: "ocr",
  };
};

export default function RescuePage() {
  const [files, setFiles] = useState<Partial<Record<UploadKind, File>>>({});
  const [dragging, setDragging] = useState<Partial<Record<UploadKind, boolean>>>(
    {}
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractedInvoice | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [demoLoading, setDemoLoading] = useState<UploadKind | null>(null);

  const hasAnyFile = useMemo(() => Object.values(files).some(Boolean), [files]);

  const previews = useMemo(() => {
    const next: Partial<Record<UploadKind, string>> = {};
    uploadSlots.forEach((slot) => {
      const selectedFile = files[slot.id];
      if (selectedFile) {
        next[slot.id] = URL.createObjectURL(selectedFile);
      }
    });
    return next;
  }, [files]);
  const primaryPreview = useMemo(
    () => previews.whatsapp ?? previews.handwritten ?? previews.receipt ?? null,
    [previews]
  );

  const assignFile = (slotId: UploadKind, file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setFiles((prev) => ({ ...prev, [slotId]: file }));
    setResult(null);
  };

  const loadDemoSample = async (kind: UploadKind) => {
    setDemoLoading(kind);
    try {
      const file = await renderDemoReceiptImage(kind);
      setFiles({ [kind]: file });
      setResult(null);
    } finally {
      setDemoLoading(null);
    }
  };

  const handleProcess = async () => {
    if (!hasAnyFile) return;
    setIsProcessing(true);
    setResult(null);
    setActiveStep(0);
    let stepTimer: ReturnType<typeof setInterval> | null = null;

    try {
      const primary = pickPrimaryFile(files);
      if (!primary) {
        setResult(fallbackInvoice);
        return;
      }

      stepTimer = setInterval(() => {
        setActiveStep((prev) => {
          if (prev >= processingSteps.length - 1) return prev;
          return prev + 1;
        });
      }, 520);

      await new Promise((resolve) => setTimeout(resolve, 700));

      const Tesseract = await import("tesseract.js");
      const ocrResult = await Tesseract.recognize(primary.file, "eng", {
        logger: () => undefined,
      });

      const ocrConfidence =
        ocrResult.data.confidence ?? fallbackInvoice.aiConfidence;
      const rawText = ocrResult.data.text ?? "";

      let parsed = buildInvoiceFromOcr(rawText, primary.type, ocrConfidence);

      const demoKey = demoKindFromFilename(primary.file.name);
      if (demoKey && demoKey === primary.type) {
        parsed = mergeDemoPolished(parsed, demoKey);
      } else if (isPoorOcrQuality(parsed, ocrConfidence)) {
        parsed = applyAiEnhancedExtraction(rawText, parsed, primary.type, ocrConfidence);
      }

      setResult(parsed);
    } catch {
      setResult({
        ...fallbackInvoice,
        rawExtractedText:
          "OCR could not process this image clearly. Try a sharper image with better lighting.",
        tags: ["OCR Failed", "Needs Better Image"],
        ignoredNoise: [],
      });
    } finally {
      if (stepTimer) {
        clearInterval(stepTimer);
      }
      setActiveStep(-1);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-8">
          <span className="text-base font-semibold tracking-wide text-white">
            Receipt Rescue
          </span>
          <Link
            href="/"
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium text-slate-200 transition hover:border-white/40 hover:bg-white/5"
          >
            Back to Home
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-8 md:py-14">
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8">
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">
            AI Receipt Processing Demo
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Upload one or more documents, then process them to simulate AI
            extraction into a clean invoice record.
          </p>
          <p className="mt-3 text-xs font-medium text-slate-400">
            Best results with clear receipt images — bright, flat photos beat glare and blur.
          </p>

          <div className="mt-6 rounded-2xl border border-indigo-400/25 bg-indigo-950/40 p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
              Demo mode — instant samples
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Loads a canvas-rendered receipt and runs real Tesseract OCR. Structured fields use a
              polished template so the UI stays demo-ready; raw text below always shows actual OCR.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!demoLoading || isProcessing}
                onClick={() => loadDemoSample("receipt")}
                className="rounded-xl border border-white/15 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-white transition hover:border-emerald-300/50 hover:bg-emerald-400/10 disabled:opacity-40"
              >
                {demoLoading === "receipt" ? "Loading…" : "Grocery receipt"}
              </button>
              <button
                type="button"
                disabled={!!demoLoading || isProcessing}
                onClick={() => loadDemoSample("handwritten")}
                className="rounded-xl border border-white/15 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-white transition hover:border-emerald-300/50 hover:bg-emerald-400/10 disabled:opacity-40"
              >
                {demoLoading === "handwritten" ? "Loading…" : "Handwritten kirana bill"}
              </button>
              <button
                type="button"
                disabled={!!demoLoading || isProcessing}
                onClick={() => loadDemoSample("whatsapp")}
                className="rounded-xl border border-white/15 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-white transition hover:border-emerald-300/50 hover:bg-emerald-400/10 disabled:opacity-40"
              >
                {demoLoading === "whatsapp" ? "Loading…" : "WhatsApp order screenshot"}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {uploadSlots.map((slot) => (
              <label
                key={slot.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging((prev) => ({ ...prev, [slot.id]: true }));
                }}
                onDragLeave={() =>
                  setDragging((prev) => ({ ...prev, [slot.id]: false }))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging((prev) => ({ ...prev, [slot.id]: false }));
                  const droppedFile = event.dataTransfer.files?.[0];
                  assignFile(slot.id, droppedFile);
                }}
                className={`group relative flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center transition ${
                  dragging[slot.id]
                    ? "border-emerald-300 bg-emerald-300/10"
                    : "border-white/20 bg-slate-950/70 hover:border-white/40 hover:bg-slate-900"
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => assignFile(slot.id, event.target.files?.[0])}
                />

                {previews[slot.id] ? (
                  <>
                    <img
                      src={previews[slot.id]}
                      alt={`${slot.label} preview`}
                      className="h-28 w-full rounded-lg object-cover"
                    />
                    <p className="mt-3 text-sm font-medium text-white">
                      {files[slot.id]?.name}
                    </p>
                    <p className="mt-1 text-xs text-emerald-200">
                      Ready for extraction
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white">{slot.label}</p>
                    <p className="mt-2 text-xs text-slate-400">{slot.helper}</p>
                    <p className="mt-4 text-xs text-indigo-200">
                      Drag and drop or click to upload
                    </p>
                  </>
                )}
              </label>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={!hasAnyFile || isProcessing}
              onClick={handleProcess}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isProcessing ? "Processing Receipt..." : "Process Receipt"}
            </button>
            <p className="text-xs text-slate-400 sm:text-sm">
              {isProcessing
                ? "AI OCR is reading text and structuring invoice fields..."
                : "Frontend-only OCR with Tesseract.js (no backend or API keys)."}
            </p>
          </div>
        </section>

        {(isProcessing || result) && (
          <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/60 p-6 md:p-8">
            <h2 className="text-2xl font-semibold text-white">Extracted Invoice</h2>

            {isProcessing && (
              <div className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 p-5">
                <p className="text-sm font-semibold text-cyan-100">
                  AI pipeline is analyzing your document
                </p>
                <div className="mt-4 grid gap-2">
                  {processingSteps.map((step, index) => {
                    const isDone = activeStep > index;
                    const isCurrent = activeStep === index;
                    return (
                      <div
                        key={`${step}-${index}`}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                          isCurrent
                            ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100"
                            : isDone
                              ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                              : "border-white/10 bg-slate-900/50 text-slate-400"
                        }`}
                      >
                        <span>{step}</span>
                        <span className="text-xs">
                          {isDone ? "Done" : isCurrent ? "Running" : "Queued"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/70">
                  <div
                    className="h-full rounded-full bg-cyan-300 transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        8,
                        ((Math.max(activeStep, 0) + 1) / processingSteps.length) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {result && (
              <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto_1.4fr] md:items-start">
                <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Original Receipt
                  </p>
                  <div className="mx-auto w-full max-w-sm rotate-[-2deg] rounded-xl border border-white/20 bg-slate-900/70 p-2 shadow-2xl shadow-black/40 transition hover:rotate-0">
                    {primaryPreview ? (
                      <img
                        src={primaryPreview}
                        alt="Uploaded receipt preview"
                        className="h-80 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-white/20 text-sm text-slate-400">
                        Uploaded image preview unavailable
                      </div>
                    )}
                  </div>
                </article>

                <div className="flex items-center justify-center py-3 md:h-full">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    <span className="hidden sm:inline">AI Transform</span>
                    <span className="animate-pulse text-base">→</span>
                  </div>
                </div>

                <article className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        AI Structured Output
                      </p>
                      {result.extractionSource === "demo" && (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                          Demo template
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadInvoicePdf(result)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-slate-800/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-emerald-400/45 hover:bg-slate-800"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-emerald-300"
                          aria-hidden
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                        Download Invoice
                      </button>
                      <span className="inline-flex rounded-full border border-indigo-300/40 bg-indigo-400/20 px-3 py-1 text-xs font-semibold text-indigo-100">
                        AI Confidence {result.aiConfidence}%
                      </span>
                    </div>
                  </div>

                  {result.extractionNote && (
                    <div className="mb-5 rounded-xl border border-violet-300/35 bg-violet-400/15 px-4 py-3 text-sm text-violet-100">
                      {result.extractionNote}
                    </div>
                  )}

                  <div className="mb-6 rounded-xl border border-rose-300/20 bg-rose-400/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-rose-200">
                        Raw extracted text (Tesseract OCR)
                      </p>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-rose-200/70">
                        Actual engine output — unedited
                      </span>
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-rose-100/90">
                      {result.rawExtractedText}
                    </pre>
                  </div>

                  <div className="mb-5 flex flex-wrap gap-2">
                    {(result.tags ?? []).map((tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                        className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {result.ignoredNoise.length > 0 && (
                    <div className="mb-6 rounded-xl border border-amber-300/25 bg-amber-400/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                        Ignored OCR Noise
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
                        {result.ignoredNoise.map((line, index) => (
                          <li key={`${line}-${index}`} className="font-mono">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-400">Customer Name</p>
                      <p className="text-base font-semibold text-white">
                        {result.customerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Date</p>
                      <p className="text-base font-semibold text-white">
                        {result.date}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Payment Status</p>
                      <p
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          result.paymentStatus === "Paid"
                            ? "bg-emerald-300/20 text-emerald-200"
                            : "bg-amber-300/20 text-amber-200"
                        }`}
                      >
                        {result.paymentStatus}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Total Amount</p>
                      <p className="text-base font-semibold text-white">
                        Rs {result.totalAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-xs text-slate-400">Items Purchased</p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-900 text-slate-300">
                          <tr>
                            <th className="px-3 py-2 font-medium">Item</th>
                            <th className="px-3 py-2 font-medium">Qty</th>
                            <th className="px-3 py-2 font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.items.map((item, index) => (
                            <tr
                              key={`${item.name}-${index}`}
                              className="border-t border-white/10"
                            >
                              <td className="px-3 py-2 text-slate-200">{item.name}</td>
                              <td className="px-3 py-2 text-slate-300">
                                {item.quantity}
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                Rs {(item.price * item.quantity).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </article>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
