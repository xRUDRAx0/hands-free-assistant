/**
 * answer.js
 * POST /api/answer
 *
 * Given a user's question and relevant procedure step context from Qdrant,
 * uses Claude to generate a natural spoken answer.
 *
 * Body:  { question: string, context: string[] }
 * Reply: { answer: string }
 */

import express from "express";
import { callLLM } from "../lib/llm.js";

const router = express.Router();

const SYSTEM_PROMPT = `You are a friendly hands-free cooking assistant. 
The user is in the middle of following a recipe and asked a question with their hands full.
Answer ONLY based on the procedure steps provided in the context.
Keep your answer short, clear, and natural-sounding for text-to-speech — 1 to 3 sentences max.
If the context doesn't contain the answer, say: "I don't have that detail in the procedure."
Do not add any markdown, lists, or formatting.`;

router.post("/", async (req, res) => {
  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: "question is required" });
  }

  // Build context string from the array of relevant step texts
  const contextText = Array.isArray(context) && context.length > 0
    ? context.map((c, i) => `Context ${i + 1}: ${c}`).join("\n")
    : "No relevant context found.";

  const userMessage = `Procedure context:\n${contextText}\n\nUser question: "${question}"`;

  try {
    const answer = await callLLM(SYSTEM_PROMPT, userMessage);
    res.json({ answer });
  } catch (err) {
    console.error("[answer] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
