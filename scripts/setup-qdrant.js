/**
 * scripts/setup-qdrant.js
 *
 * One-time setup script: reads procedure steps from procedures.json,
 * embeds each one using local TF-IDF hashing, and upserts them to Qdrant Cloud.
 *
 * Run ONCE before starting the app:
 *   node scripts/setup-qdrant.js
 *
 * Requirements: .env must have QDRANT_URL and QDRANT_API_KEY.
 * No external embedding API key needed — embeddings are computed locally.
 */

import "dotenv/config";
import { readFileSync }              from "fs";
import { fileURLToPath }             from "url";
import { dirname, join }             from "path";
import { createHash }                from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────
const __dir     = dirname(fileURLToPath(import.meta.url));
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION || "hands-free-procedures";

const VECTOR_SIZE = 512; // matches server/lib/embeddings.js

// Validate required env vars
const missing = ["QDRANT_URL", "QDRANT_API_KEY"].filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[setup] Missing env vars: ${missing.join(", ")}`);
  console.error("[setup] Copy .env.example to .env and fill in your keys.");
  process.exit(1);
}

// ── Local TF-IDF Hash Embedding ───────────────────────────────────────────────
// Same algorithm as server/lib/embeddings.js (must stay in sync)

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","it",
  "its","this","that","these","those","i","you","he","she","we","they",
  "your","my","our","their","from","by","about","into","through","during",
  "before","after","above","below","up","down","out","off","over","under",
]);

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t)
  );
}

function hashToken(token) {
  const hash = createHash("sha256").update(token).digest();
  return hash.readUInt32BE(0) % VECTOR_SIZE;
}

function embedText(text) {
  const tokens = tokenize(text);
  const vector = new Float32Array(VECTOR_SIZE);
  for (const token of tokens) vector[hashToken(token)] += 1;
  const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (mag > 0) for (let i = 0; i < VECTOR_SIZE; i++) vector[i] /= mag;
  return Array.from(vector);
}

// ── Qdrant Helpers ────────────────────────────────────────────────────────────
const { default: fetch } = await import("node-fetch");

const qdrantHeaders = {
  "Content-Type": "application/json",
  "api-key": QDRANT_API_KEY,
};

/** Create collection with 512-dim cosine vectors */
async function createCollection() {
  console.log(`[setup] Creating Qdrant collection "${COLLECTION}"...`);
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: "PUT",
    headers: qdrantHeaders,
    body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: "Cosine" } }),
  });
  const data = await res.json();
  if (data.status === "ok" || data?.result === true) {
    console.log("[setup] ✓ Collection created.");
  } else if (res.status === 400) {
    console.log("[setup] ✓ Collection already exists — skipping creation.");
  } else {
    console.log("[setup] Collection response:", JSON.stringify(data));
  }
}

/** Create payload indexes required for filtered scroll queries */
async function createIndexes() {
  const fields = [
    { field_name: "procedure_id", field_schema: "keyword" },
    { field_name: "step_number",  field_schema: "integer" },
  ];
  for (const f of fields) {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
      method: "PUT",
      headers: qdrantHeaders,
      body: JSON.stringify(f),
    });
    const d = await res.json();
    console.log(`[setup] ✓ Index "${f.field_name}": ${d.status}`);
  }
}

/** Upsert all points in a single batch */
async function upsertPoints(points) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      headers: qdrantHeaders,
      body: JSON.stringify({ points }),
    }
  );
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Hands-Free Assistant — Qdrant Setup Script  ");
  console.log("═══════════════════════════════════════════════");
  console.log(`[setup] Qdrant URL:  ${QDRANT_URL}`);
  console.log(`[setup] Collection:  ${COLLECTION}`);
  console.log(`[setup] Vector size: ${VECTOR_SIZE} (local TF-IDF)\n`);

  // 1. Load procedure data
  const procedurePath = join(__dir, "../server/data/procedures.json");
  const procedure = JSON.parse(readFileSync(procedurePath, "utf-8"));
  console.log(`[setup] Loaded procedure: "${procedure.name}" (${procedure.steps.length} steps)`);

  // 2. Create collection
  await createCollection();

  // 3. Embed each step locally (instant, no API call)
  console.log("\n[setup] Embedding steps (local TF-IDF, no API needed)...");
  const points = [];
  for (const step of procedure.steps) {
    const vector = embedText(step.text);
    points.push({
      id: step.step_number,
      vector,
      payload: {
        procedure_id: procedure.id,
        step_number: step.step_number,
        text: step.text,
      },
    });
    console.log(`  Step ${step.step_number}: ✓ (${vector.filter(v => v > 0).length} non-zero dims)`);
  }

  // 4. Upsert all at once
  console.log("\n[setup] Upserting points to Qdrant...");
  const result = await upsertPoints(points);
  if (
    result?.status === "acknowledged" ||
    result?.result?.status === "acknowledged"
  ) {
    console.log(`[setup] ✓ All ${points.length} steps upserted successfully!`);
  } else {
    console.log("[setup] Upsert response:", JSON.stringify(result));
  }

  // 5. Create payload indexes for filtered scroll queries
  console.log("\n[setup] Creating payload indexes...");
  await createIndexes();

  console.log("\n[setup] ✓ Setup complete! Run: npm run dev");
}

main().catch((err) => {
  console.error("[setup] Fatal error:", err.message);
  process.exit(1);
});
