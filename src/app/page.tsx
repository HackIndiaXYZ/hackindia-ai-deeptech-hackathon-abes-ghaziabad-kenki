import Link from "next/link";

export default function Home() {
  const flowSteps = [
    {
      title: "Upload",
      description:
        "Drop receipts, handwritten bills, or WhatsApp screenshots in seconds.",
    },
    {
      title: "Extract",
      description:
        "AI reads noisy text and line items, then fixes structure automatically.",
    },
    {
      title: "Organize",
      description:
        "Records are grouped into clean entries ready for bookkeeping workflows.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-8">
          <span className="text-base font-semibold tracking-wide text-white">
            Receipt Rescue
          </span>
          <Link
            href="/rescue"
            className="rounded-full border border-emerald-400/60 px-4 py-1.5 text-sm font-medium text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/10"
          >
            Try MVP
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center md:px-8 md:py-24">
          <div className="space-y-7">
            <p className="inline-flex rounded-full border border-indigo-300/30 bg-indigo-400/10 px-3 py-1 text-xs font-medium tracking-wide text-indigo-200">
              AI-Powered Business Records
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Turn messy receipts into clean records in minutes.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Receipt Rescue converts crumpled bills, handwritten notes, and
              WhatsApp order screenshots into organized digital entries your
              team can actually use.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/rescue"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Start Rescue
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/40 hover:bg-white/5"
              >
                View Dashboard
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/30">
            <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm font-medium text-slate-300">
                Incoming Documents
              </p>
              <div className="grid gap-2 text-sm text-slate-400">
                <p className="rounded-lg bg-slate-800/70 px-3 py-2">
                  Grocery_Receipt_2026.jpg
                </p>
                <p className="rounded-lg bg-slate-800/70 px-3 py-2">
                  Handwritten_Bill.png
                </p>
                <p className="rounded-lg bg-slate-800/70 px-3 py-2">
                  WhatsApp_Order_Screenshot.jpeg
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-4">
              <p className="text-xs uppercase tracking-wider text-emerald-200">
                Extraction Confidence
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-100">
                96.8%
              </p>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-white/10 bg-slate-900/70"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-8">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              How it Works
            </h2>
            <p className="mt-3 max-w-2xl text-slate-300">
              A fast 3-step flow designed for small businesses and ops teams.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {flowSteps.map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-2xl border border-white/10 bg-slate-950/80 p-5"
                >
                  <p className="text-xs font-semibold tracking-wider text-indigo-200">
                    STEP {index + 1}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="demo"
          className="mx-auto w-full max-w-6xl px-6 py-16 md:px-8"
        >
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">
              Dashboard Preview
            </h2>
            <p className="mt-3 max-w-2xl text-slate-300">
              Clean records, searchable transactions, and a quick daily summary
              for better decision making.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                <p className="text-xs text-slate-400">Processed Today</p>
                <p className="mt-2 text-3xl font-semibold text-white">142</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                <p className="text-xs text-slate-400">Total Spend Tagged</p>
                <p className="mt-2 text-3xl font-semibold text-white">$8,420</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                <p className="text-xs text-slate-400">Needs Review</p>
                <p className="mt-2 text-3xl font-semibold text-amber-300">7</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-slate-400 md:flex-row md:px-8">
          <p>Receipt Rescue MVP</p>
          <p>Built for hackathon demo day</p>
        </div>
      </footer>
    </div>
  );
}
