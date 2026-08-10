/**
 * useSession.js
 * Session state machine hook — the core brain of the app.
 *
 * Manages: current step index, session state, procedure flow
 * States: idle → speaking → listening → thinking → speaking → ...
 *
 * Returns helpers for App.jsx to call and current session state to render.
 */

import { useState, useRef, useCallback } from "react";

// The hardcoded procedure ID (must match procedures.json)
const PROCEDURE_ID = "cold-brew-coffee";
const TOTAL_STEPS = 8;

// Fallback phrase spoken when something goes wrong or speech is unclear
const UNCLEAR_TEXT =
  "I didn't catch that. Say next, repeat, go back, ask a question, or say done to finish.";

// Fallback when Rime or network fails
const ERROR_TEXT =
  "Something went wrong. Please try again.";

export function useSession() {
  // "idle" | "listening" | "thinking" | "speaking" | "done"
  const [sessionState, setSessionState] = useState("idle");
  const [currentStep, setCurrentStep] = useState(0); // 0 = not started
  const [isActive, setIsActive] = useState(false);

  // Prevent overlapping calls when audio is still playing
  const isBusyRef = useRef(false);

  // ── API Helpers ─────────────────────────────────────────────────────────────

  /** Fetch step text from Express → Qdrant */
  async function fetchStep(stepNumber) {
    const res = await fetch("/api/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ procedureId: PROCEDURE_ID, stepNumber }),
    });
    if (!res.ok) throw new Error(`Step fetch failed: ${res.status}`);
    const data = await res.json();
    return data.text;
  }

  /** Classify transcript intent via Express → Claude */
  async function classify(transcript, stepNum) {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        currentStep: stepNum,
        totalSteps: TOTAL_STEPS,
      }),
    });
    if (!res.ok) throw new Error(`Classify failed: ${res.status}`);
    return res.json(); // { intent, detail }
  }

  /** Semantic search via Express → OpenAI Embeddings → Qdrant */
  async function searchProcedure(query) {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ procedureId: PROCEDURE_ID, query }),
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  /** Get a Claude-generated answer using search results as context */
  async function answerQuestion(question, contextResults) {
    const context = contextResults.map((r) => r.text);
    const res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    });
    if (!res.ok) throw new Error(`Answer failed: ${res.status}`);
    const data = await res.json();
    return data.answer;
  }

  /**
   * Speak text via Express → Rime TTS.
   * Returns a Promise that resolves when the audio finishes playing.
   */
  const speakText = useCallback(async (text) => {
    setSessionState("speaking");

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`Rime TTS error: ${res.status}`);

      const { audioContent } = await res.json();

      // Decode base64 WAV → ArrayBuffer → AudioBuffer → play
      await new Promise((resolve, reject) => {
        const audioBytes = Uint8Array.from(atob(audioContent), (c) =>
          c.charCodeAt(0)
        );
        const blob = new Blob([audioBytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Audio playback failed"));
        };

        audio.play().catch(reject);
      });
    } catch (err) {
      console.error("[speakText] Error:", err.message);
      // Try to speak error message — if that also fails, just continue
      try {
        const res2 = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: ERROR_TEXT }),
        });
        if (res2.ok) {
          const { audioContent } = await res2.json();
          await playBase64Audio(audioContent);
        }
      } catch {
        // Silently continue if even the error TTS fails
      }
    }
  }, []);

  /** Helper: play base64 audio and await completion */
  async function playBase64Audio(base64) {
    return new Promise((resolve) => {
      const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(resolve);
    });
  }

  // ── Session Flow ────────────────────────────────────────────────────────────

  /**
   * Start a fresh session: speak step 1 then switch to listening.
   * Called when user taps the mic button from idle state.
   */
  const startSession = useCallback(async (onReadyToListen) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    setIsActive(true);
    setCurrentStep(1);

    try {
      const text = await fetchStep(1);
      await speakText(text);
    } catch (err) {
      console.error("[startSession]", err.message);
      await speakText(UNCLEAR_TEXT);
    }

    isBusyRef.current = false;
    setSessionState("listening");
    onReadyToListen?.();
  }, [speakText]);

  /**
   * Process a voice transcript: classify intent → fetch/answer → speak.
   * Called by App.jsx whenever useSpeechRecognition fires an onResult.
   */
  const handleTranscript = useCallback(
    async (transcript, currentStepRef, onReadyToListen) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;

      const step = currentStepRef;
      setSessionState("thinking");

      try {
        let textToSpeak;
        let nextStep = step;

        // ── Step 1: Classify intent ──────────────────────────────────────────
        let intent, detail;
        if (!transcript || transcript.trim() === "") {
          intent = "UNCLEAR";
          detail = "";
        } else {
          const classified = await classify(transcript, step);
          intent = classified.intent;
          detail = classified.detail;
        }

        console.log(`[session] Intent: ${intent}, Detail: "${detail}", Step: ${step}`);

        // ── Step 2: Act on intent ────────────────────────────────────────────
        switch (intent) {
          case "NEXT": {
            if (step >= TOTAL_STEPS) {
              textToSpeak =
                "That was the last step. Say done to finish, or ask if you have any questions.";
            } else {
              nextStep = step + 1;
              textToSpeak = await fetchStep(nextStep);
              setCurrentStep(nextStep);
            }
            break;
          }

          case "REPEAT": {
            textToSpeak = await fetchStep(step);
            break;
          }

          case "BACK": {
            // Extract how many steps back (Claude parses e.g. "go back two steps" → detail: "2")
            const stepsBack = parseInt(detail) || 1;
            nextStep = Math.max(1, step - stepsBack);
            textToSpeak = await fetchStep(nextStep);
            setCurrentStep(nextStep);
            break;
          }

          case "QUESTION": {
            // Semantic search Qdrant → Claude answer
            const question = detail || transcript;
            const results = await searchProcedure(question);
            if (results.length === 0) {
              textToSpeak =
                "I don't have that detail in the procedure. Try asking something else or say next to continue.";
            } else {
              textToSpeak = await answerQuestion(question, results);
            }
            break;
          }

          case "DONE": {
            textToSpeak = "Session complete. Great job making cold brew coffee!";
            await speakText(textToSpeak);
            setSessionState("done");
            setIsActive(false);
            isBusyRef.current = false;
            return; // Don't loop back to listening
          }

          default: {
            // UNCLEAR or unrecognized intent
            textToSpeak = UNCLEAR_TEXT;
            break;
          }
        }

        // ── Step 3: Speak the result ─────────────────────────────────────────
        await speakText(textToSpeak);
      } catch (err) {
        console.error("[handleTranscript]", err.message);
        await speakText(UNCLEAR_TEXT);
      }

      // ── Step 4: Return to listening ──────────────────────────────────────
      isBusyRef.current = false;
      setSessionState("listening");
      onReadyToListen?.();
    },
    [speakText]
  );

  /** End the session and reset state to idle */
  const endSession = useCallback(() => {
    setSessionState("idle");
    setIsActive(false);
    setCurrentStep(0);
    isBusyRef.current = false;
  }, []);

  return {
    sessionState,
    currentStep,
    totalSteps: TOTAL_STEPS,
    isActive,
    startSession,
    handleTranscript,
    endSession,
  };
}
