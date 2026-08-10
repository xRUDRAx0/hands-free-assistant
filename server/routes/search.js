/**
 * search.js
 * POST /api/search
 *
 * Performs a semantic search against the procedure steps stored in Qdrant.
 * Used when the intent is QUESTION — finds the most relevant step(s) to use
 * as context for the LLM answer.
 *
 * Body:  { procedureId: string, query: string }
 * Reply: { results: Array<{ text: string, step_number: number }> }
 */

import express from "express";
import { embedText } from "../lib/embeddings.js";
import { semanticSearch } from "../lib/qdrant.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { procedureId, query } = req.body;

  if (!procedureId || !query) {
    return res.status(400).json({ error: "procedureId and query are required" });
  }

  try {
    // 1. Embed the user's question
    const queryVector = await embedText(query);

    // 2. Search Qdrant for the top 3 most semantically similar steps
    const results = await semanticSearch(queryVector, procedureId, 3);

    res.json({ results });
  } catch (err) {
    console.error("[search] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
