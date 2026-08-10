/**
 * llm.js
 * LLM wrapper using Groq — free tier, ultra-fast Llama 3.1 8B.
 *
 * Groq's API is fully OpenAI-compatible, so this is a simple REST call.
 * Free tier: https://console.groq.com (no credit card required)
 *
 * Used for:
 *   - Intent classification (classify route)
 *   - Q&A answers with Qdrant context (answer route)
 */

import fetch from "node-fetch";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// llama-3.1-8b-instant: fastest Groq model, perfect for short classification tasks
const DEFAULT_MODEL = "llama-3.1-8b-instant";

/**
 * Send a chat completion request to Groq and return the response text.
 *
 * @param {string} systemPrompt - System-level instructions
 * @param {string} userMessage  - The user input
 * @param {string} [model]      - Groq model ID (defaults to llama-3.1-8b-instant)
 * @returns {Promise<string>}   - LLM text response
 */
export async function callLLM(systemPrompt, userMessage, model = DEFAULT_MODEL) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      temperature: 0.1,  // Low temp for deterministic classification
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
