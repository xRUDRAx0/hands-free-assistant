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

// Route handlers
import classifyRouter from "./routes/classify.js";
import stepRouter from "./routes/step.js";
import searchRouter from "./routes/search.js";
import speakRouter from "./routes/speak.js";
import answerRouter from "./routes/answer.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
// Allow Vite dev server (localhost:5173) to call us
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));

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

// ── Start ────────────────────────────────────────────────────────────────────
// NOTE: Express 5 changed app.listen() to return a Promise — must await it
// so the event loop stays open and the server doesn't immediately exit.
const server = await app.listen(PORT);
console.log(`[server] Hands-Free Assistant backend running on http://localhost:${PORT}`);
console.log(`[server] Routes: /api/classify | /api/step | /api/search | /api/speak | /api/answer`);
