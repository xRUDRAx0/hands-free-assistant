/**
 * classify.js
 * POST /api/classify
 *
 * Takes a voice transcript + current step context, calls Claude to classify
 * the user's intent as one of: NEXT, REPEAT, BACK, QUESTION, DONE
 *
 * Body:  { transcript: string, currentStep: number, totalSteps: number }
 * Reply: { intent: string, detail: string }
 */

import express from "express";
import { callLLM } from "../lib/llm.js";

const router = express.Router();

// System prompt that locks Claude into structured JSON output
const SYSTEM_PROMPT = `You are an intent classifier for a hands-free voice-controlled cooking assistant.
The user is following a step-by-step procedure and cannot touch their device.
Their speech transcript may be noisy or informal.

Classify the user's transcript into EXACTLY ONE of these intents:
- NEXT     : User wants to advance to the next step ("next", "continue", "okay got it", "done", "move on", "what's next")
- REPEAT   : User wants to hear the current step again ("repeat", "say that again", "what was that", "come again")
- BACK     : User wants to go to a previous step ("go back", "back", "previous", "wait go back two steps")
- QUESTION : User is asking a factual question about the procedure ("how much", "what kind", "why", "how long", "what temperature")
- DONE     : User wants to end the session ("done", "finish", "stop", "quit", "I'm done", "all done", "end")

For BACK, extract how many steps back (default 1).
For QUESTION, pass through the full question text as detail.
If the transcript is unclear, empty, or doesn't match any intent, respond with REPEAT.

Always respond with ONLY valid JSON — no markdown, no explanation:
{"intent": "NEXT", "detail": ""}`;

router.post("/", async (req, res) => {
  const { transcript, currentStep, totalSteps } = req.body;

  // Guard against empty transcript — treat as unclear
  if (!transcript || transcript.trim().length === 0) {
    return res.json({ intent: "UNCLEAR", detail: "" });
  }

  const userMessage = `Transcript: "${transcript}"
Current step: ${currentStep} of ${totalSteps}`;

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userMessage);

    // Parse the JSON response from Claude
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // If Claude hallucinated non-JSON, default to REPEAT
      parsed = { intent: "REPEAT", detail: "" };
    }

    res.json(parsed);
  } catch (err) {
    console.error("[classify] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
