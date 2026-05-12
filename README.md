# Receipt Rescue

**Receipt Rescue** is an AI-assisted web application that turns messy receipts, handwritten bills, and WhatsApp-style order screenshots into cleaner, structured digital records you can review, adjust, and reuse in your workflow.

---

## Short description

Upload an image, run text extraction in the browser, and map the output into business-friendly fields (items, amounts, dates, vendor notes). The goal is less manual retyping and fewer lost details—not perfect automation, but a practical first pass you can trust enough to edit.

---

## Problem statement

Small businesses and side projects often accumulate proof-of-purchase in inconsistent formats: crumpled thermal receipts, quick pen-and-paper totals, or screenshots shared in chat. That content is easy to misplace and painful to reconcile. Spreadsheets and accounting tools expect structured data, so someone still ends up doing slow, error-prone data entry.

---

## Solution

Receipt Rescue meets users where the evidence already lives (photos and screenshots). It uses **client-side OCR** to pull text from images, then presents it in a structured layout so you can correct mistakes before the record is “final.” Export paths (for example, PDF summaries) support sharing or archiving without rebuilding everything from scratch.

---

## Features

- **Image-first input** — receipts, handwritten notes, and chat screenshots as starting points  
- **In-browser OCR** — text extraction powered by **Tesseract.js** (no server round-trip required for the core read step)  
- **Structured view** — line items and totals organized for quick review  
- **Human-in-the-loop** — edit and validate before treating output as authoritative  
- **Modern UI** — responsive interface built with **Next.js** and **Tailwind CSS**  
- **Type-safe codebase** — **TypeScript** for clearer contracts and safer refactors  

*Accuracy depends on image quality, lighting, font, and language. Poor photos or heavy handwriting will still need manual cleanup.*

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Framework | [Next.js](https://nextjs.org/) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) |
| PDF utilities | `jspdf`, `jspdf-autotable` (for table-style exports where implemented) |

---

## How it works

1. **Upload** — User selects or drops an image in the browser.  
2. **Preprocess (optional)** — Simple client-side handling (e.g. scaling) may be applied to improve OCR behavior.  
3. **OCR** — Tesseract.js runs locally to produce raw text and confidence cues.  
4. **Structure** — Heuristics or light parsing map text blocks into fields such as merchant, date, line items, and totals.  
5. **Review** — User fixes OCR errors and ambiguous splits—this step is intentional.  
6. **Output** — Structured data and/or export formats can be generated for records or demos.  

This pipeline favors **privacy-friendly, offline-capable OCR** over sending raw receipt images to a third party—at the cost of needing reasonable image quality and patience on first run while language data loads.

---

## Demo flow

1. Clone the repo and run the dev server (see [Installation](#installation)).  
2. Open the app in a modern browser (Chrome or Edge recommended for consistent Web APIs).  
3. Upload a clear photo of a printed receipt and walk through extraction → structured view → small edits.  
4. Optionally repeat with a trickier sample (handwriting or low light) to show **honest limits** and the value of the review step.  
5. If PDF export is wired in your build, generate a sample export for judges.  

Keep demo samples short and legible so the hackathon slot stays on UX and trust, not waiting on OCR.

---

## Future scope

- Stronger parsing rules or optional **server-side** models for harder layouts (tables, multi-column bills)  
- **Multi-language** OCR profiles and saved defaults per vendor  
- **CSV / accounting-friendly** exports and column mapping  
- Optional **cloud sync** with explicit consent and retention policies  
- **Batch uploads** for month-end reconciliation  

None of the above is required for a credible MVP; they are natural extensions if the product moves beyond a hackathon prototype.

---

## Installation

**Prerequisites:** [Node.js](https://nodejs.org/) 20+ (LTS recommended) and npm.

```bash
git clone <your-repo-url>
cd receipt-rescue
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

**Other scripts**

```bash
npm run build   # production build
npm run start   # run production server (after build)
npm run lint    # ESLint
```

---

## Screenshots

_Add images under `public/` or `.github/` and link them here._

| Placeholder | Description |
|-------------|-------------|
| `![Home / upload](docs/screenshots/01-upload.png)` | Landing or upload step |
| `![OCR progress](docs/screenshots/02-ocr.png)` | OCR running / progress state |
| `![Structured review](docs/screenshots/03-review.png)` | Editable structured output |
| `![Export](docs/screenshots/04-export.png)` | Export or summary (if applicable) |

---

## Contributing

Contributions are welcome—issues and pull requests help sharpen parsing rules, accessibility, and OCR ergonomics.

1. Fork the repository and create a branch for your change.  
2. Run `npm run lint` before opening a PR.  
3. Describe **what** changed and **why**; include screenshots for UI updates.  
4. Keep scope focused; large refactors are easier to review when split up.  

For hackathon teams, agree on a short **CONTRIBUTING** note in the repo wiki or discussions if you outgrow this section.

---

## License

This repository does not yet include a root-level `LICENSE` file. Before publishing or reusing the code beyond the hackathon, the team should pick a license (for example [MIT](https://opensource.org/licenses/MIT) or [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)) and commit the full license text. Until then, treat usage and redistribution as **unspecified** and coordinate with the maintainers.
