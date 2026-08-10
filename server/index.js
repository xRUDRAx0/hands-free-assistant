/**
 * server/index.js
 * Express backend entry point.
 *
 * Runs on port 3001 (Vite dev server proxies /api/* here).
 * All API keys stay server-side — never sent to the browser.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join }  from "path";
import { existsSync }     from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd    = process.env.NODE_ENV === "production";

// Route handlers
import classifyRouter from "./routes/classify.js";
import stepRouter from "./routes/step.js";
import searchRouter from "./routes/search.js";
import speakRouter from "./routes/speak.js";
import answerRouter from "./routes/answer.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
// In dev, Vite runs separately on :5173 — allow it to call our API.
// In prod, everything is same-origin so CORS is only needed for external tools.
if (!isProd) {
  app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
}

// Parse JSON request bodies (up to 1MB — audio responses can be chunky)
app.use(express.json({ limit: "1mb" }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/classify", classifyRouter); // LLM intent classification
app.use("/api/step", stepRouter);         // Qdrant step fetch by number
app.use("/api/search", searchRouter);     // Qdrant semantic search
app.use("/api/speak", speakRouter);       // Rime TTS proxy
app.use("/api/answer", answerRouter);     // LLM answer with context

// Health check — useful for smoke testing
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Production: serve Vite build ─────────────────────────────────────────────
if (isProd) {
  const distPath = join(__dirname, "../dist");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    // Fallback to index.html for client-side routing
    app.get("*", (_req, res) =>
      res.sendFile(join(distPath, "index.html"))
    );
    console.log(`[server] Serving static build from ${distPath}`);
  } else {
    console.warn("[server] WARNING: dist/ not found — run 'npm run build' first");
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
// NOTE: Express 5 changed app.listen() to return a Promise — must await it
// so the event loop stays open and the server doesn't immediately exit.
const server = await app.listen(PORT);
console.log(`[server] Hands-Free Assistant backend running on http://localhost:${PORT}`);
console.log(`[server] Routes: /api/classify | /api/step | /api/search | /api/speak | /api/answer`);
