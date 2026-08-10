/**
 * claude.js
 * Thin wrapper around the Anthropic Messages API.
 * Used for intent classification and question answering.
 */

const { default: fetch } = await import("node-fetch");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const API_URL = "https://api.anthropic.com/v1/messages";

// Use Haiku for speed — perfect for real-time intent classification
const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

/**
 * Send a message to Claude and get the text response back.
 *
 * @param {string} systemPrompt - The system-level instructions for Claude
 * @param {string} userMessage  - The user's input text
 * @param {string} [model]      - Override the default model
 * @returns {Promise<string>}   - Claude's text response
 */
export async function callClaude(systemPrompt, userMessage, model = DEFAULT_MODEL) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // Extract the text from the first content block
  return data.content?.[0]?.text ?? "";
}
