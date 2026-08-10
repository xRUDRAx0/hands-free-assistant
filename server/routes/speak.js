/**
 * speak.js
 * POST /api/speak
 *
 * Proxies text to the Rime TTS API and returns base64-encoded WAV audio.
 * This proxy is essential: it keeps the RIME_API_KEY on the server.
 *
 * Body:  { text: string }
 * Reply: { audioContent: string }  ← base64-encoded WAV
 */

import express from "express";
import { synthesizeSpeech } from "../lib/rime.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    // Get raw WAV bytes from Rime
    const audioBuffer = await synthesizeSpeech(text);

    // Base64-encode so it can be transported as JSON to the browser
    const audioContent = audioBuffer.toString("base64");

    res.json({ audioContent });
  } catch (err) {
    console.error("[speak] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
