/**
 * rime.js
 * Proxy wrapper for the Rime Text-to-Speech API.
 *
 * Endpoint: POST https://users.rime.ai/v1/rime-tts
 * Auth:     Authorization: Bearer <RIME_API_KEY>
 * Response: Raw binary WAV audio bytes (when Accept: audio/wav)
 */

import fetch from "node-fetch";

const RIME_API_KEY = process.env.RIME_API_KEY;
const RIME_URL = "https://users.rime.ai/v1/rime-tts";

/**
 * Convert text to speech using Rime's Coda model.
 * Returns the raw audio as a Node.js Buffer.
 *
 * @param {string} text - The text to synthesize
 * @returns {Promise<Buffer>} - WAV audio bytes
 */
export async function synthesizeSpeech(text) {
  const res = await fetch(RIME_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RIME_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "audio/wav",
    },
    body: JSON.stringify({
      text,
      speaker: "celeste", // Confirmed working with coda model
      modelId: "coda",   // Rime's flagship low-latency model
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Rime TTS error ${res.status}: ${errText}`);
  }

  // Return raw binary buffer — caller will base64-encode for JSON transport
  return Buffer.from(await res.arrayBuffer());
}
