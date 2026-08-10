/**
 * embeddings.js
 * Local TF-IDF style embedding for small datasets (no external API needed).
 *
 * For a procedure with only 8 steps, a bag-of-words TF-IDF embedding is
 * sufficient for semantic search — the vocabulary is small and controlled.
 *
 * Produces 512-dimensional vectors. Deterministic and instant.
 *
 * NOTE: If you want higher-quality embeddings for larger datasets,
 * replace this with a call to OpenAI, Cohere, or Jina AI.
 */

import { createHash } from "crypto";

const VECTOR_SIZE = 512;

/**
 * Simple tokenizer: lowercase, split on non-alphanumeric, remove stopwords.
 */
const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","it",
  "its","this","that","these","those","i","you","he","she","we","they",
  "your","my","our","their","from","by","about","into","through","during",
  "before","after","above","below","up","down","out","off","over","under",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Hash a token to a bucket index in [0, VECTOR_SIZE).
 * Uses SHA-256 for good distribution.
 */
function hashToken(token) {
  const hash = createHash("sha256").update(token).digest();
  // Read first 4 bytes as an unsigned int, mod VECTOR_SIZE
  return hash.readUInt32BE(0) % VECTOR_SIZE;
}

/**
 * Embed text into a VECTOR_SIZE-dimensional TF-IDF vector.
 * Each dimension represents a hash bucket; values are term frequencies.
 * The vector is L2-normalized for cosine similarity.
 *
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - Normalized float vector
 */
export async function embedText(text) {
  const tokens = tokenize(text);
  const vector = new Float32Array(VECTOR_SIZE);

  // Term frequency: increment the bucket for each token
  for (const token of tokens) {
    const idx = hashToken(token);
    vector[idx] += 1;
  }

  // L2 normalize so cosine similarity works correctly
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      vector[i] /= magnitude;
    }
  }

  return Array.from(vector);
}

// Export the vector size so setup-qdrant.js can use it
export const EMBEDDING_SIZE = VECTOR_SIZE;
