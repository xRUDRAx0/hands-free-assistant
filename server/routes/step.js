/**
 * step.js
 * POST /api/step
 *
 * Fetches a specific step from Qdrant by procedure ID and step number.
 * Used for NEXT, REPEAT, BACK intents — no vector required.
 *
 * Body:  { procedureId: string, stepNumber: number }
 * Reply: { text: string, stepNumber: number } | { error: string }
 */

import express from "express";
import { fetchStepByNumber } from "../lib/qdrant.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { procedureId, stepNumber } = req.body;

  if (!procedureId || stepNumber == null) {
    return res.status(400).json({ error: "procedureId and stepNumber are required" });
  }

  try {
    const payload = await fetchStepByNumber(procedureId, stepNumber);

    if (!payload) {
      return res.status(404).json({ error: `Step ${stepNumber} not found for procedure "${procedureId}"` });
    }

    res.json({ text: payload.text, stepNumber: payload.step_number });
  } catch (err) {
    console.error("[step] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
