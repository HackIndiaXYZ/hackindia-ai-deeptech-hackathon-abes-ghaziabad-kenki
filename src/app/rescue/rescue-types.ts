export type UploadKind = "receipt" | "handwritten" | "whatsapp";
export type PaymentStatus = "Paid" | "Unpaid";

export type ExtractedItem = {
  name: string;
  quantity: number;
  price: number;
};

export type ExtractionSource = "ocr" | "demo" | "ai_enhanced";

export type ExtractedInvoice = {
  customerName: string;
  date: string;
  items: ExtractedItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  rawExtractedText: string;
  aiConfidence: number;
  tags: string[];
  ignoredNoise: string[];
  /** Shown when heuristic cleanup ran after weak OCR. */
  extractionNote?: string;
  extractionSource?: ExtractionSource;
};
