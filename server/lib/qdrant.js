/**
 * qdrant.js
 * Thin REST client for Qdrant Cloud.
 * All interactions use the REST API with api-key header auth.
 */

import fetch from "node-fetch";

const QDRANT_URL = process.env.QDRANT_URL;          // e.g. https://xyz.qdrant.io:6333
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION = process.env.QDRANT_COLLECTION || "hands-free-procedures";

/** Shared headers for every Qdrant request */
const headers = () => ({
  "Content-Type": "application/json",
  "api-key": QDRANT_API_KEY,
});

/**
 * Create the collection with 1536-dim cosine vectors (matches OpenAI embeddings).
 * If it already exists, the 400 response is swallowed gracefully.
 */
export async function createCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      vectors: { size: 512, distance: "Cosine" },  // local TF-IDF hash embedding = 512 dims
    }),
  });
  const data = await res.json();
  return data;
}

/**
 * Upsert an array of points into the collection.
 * Each point: { id: number, vector: float[], payload: { procedure_id, step_number, text } }
 */
export async function upsertPoints(points) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ points }),
    }
  );
  return res.json();
}

/**
 * Fetch a specific step by procedure_id + step_number using payload filter (no vector needed).
 * Returns the first matching point's payload, or null if not found.
 */
export async function fetchStepByNumber(procedureId, stepNumber) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        filter: {
          must: [
            { key: "procedure_id", match: { value: procedureId } },
            { key: "step_number", match: { value: stepNumber } },
          ],
        },
        limit: 1,
        with_payload: true,
        with_vector: false,
      }),
    }
  );
  const data = await res.json();
  const point = data?.result?.points?.[0];
  return point ? point.payload : null;
}

/**
 * Semantic search: find the most relevant steps for a natural-language query.
 * Returns top-k results as an array of payload objects.
 */
export async function semanticSearch(queryVector, procedureId, limit = 3) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        vector: queryVector,
        filter: {
          must: [{ key: "procedure_id", match: { value: procedureId } }],
        },
        limit,
        with_payload: true,
      }),
    }
  );
  const data = await res.json();
  return (data?.result || []).map((r) => r.payload);
}
