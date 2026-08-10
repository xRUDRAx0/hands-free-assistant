/**
 * App.jsx
 * Hands-Free Assistant — main and only React component.
 *
 * Intentionally minimal UI: one mic button + one animated state ring.
 * No text display — the entire experience is audio.
 *
 * State machine (visual):
 *   idle  →  speaking (step 1)  →  listening  →  thinking  →  speaking  →  listening ...
 */

import { useCallback, useRef } from "react";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useSession } from "./hooks/useSession";
import "./App.css";

// Icons as inline SVG for zero dependencies
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
    <path
      d="M5 10a7 7 0 0 0 14 0"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="9" y1="21" x2="15" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export default function App() {
  const {
    sessionState,
    currentStep,
    totalSteps,
    isActive,
    startSession,
    handleTranscript,
    endSession,
  } = useSession();

  const { startListening, stopListening } = useSpeechRecognition();

  // Stable ref to currentStep so the closure in handleTranscript stays current
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  /** Called by the session after speaking — starts the next listen cycle */
  const listenCycle = useCallback(() => {
    startListening((transcript) => {
      handleTranscript(transcript, currentStepRef.current, listenCycle);
    });
  }, [startListening, handleTranscript]);

  /** Tap mic when idle → kick off the whole session */
  const handleMicClick = useCallback(() => {
    if (sessionState === "idle" || sessionState === "done") {
      startSession(listenCycle);
    }
    // While active, the mic button is purely decorative (no accidental taps)
  }, [sessionState, startSession, listenCycle]);

  /** Stop button: clean up and return to idle */
  const handleStop = useCallback(() => {
    stopListening();
    endSession();
  }, [stopListening, endSession]);

  // ── Derived UI state ───────────────────────────────────────────────────────
  const stateLabel = {
    idle: "Tap to start",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    done: "Session complete",
  }[sessionState] ?? "Ready";

  const stepLabel =
    isActive && currentStep > 0
      ? `Step ${currentStep} of ${totalSteps}`
      : "";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app" data-state={sessionState}>
      {/* Ambient radial background pulse — colour shifts with state */}
      <div className="bg-glow" aria-hidden="true" />

      <main className="stage">
        {/* App title — hidden during session for eyes-free UX */}
        <header className={`header ${isActive ? "header--hidden" : ""}`}>
          <h1 className="title">Hands‑Free Assistant</h1>
          <p className="subtitle">Follow any procedure, voice only.</p>
        </header>

        {/* Central mic button with animated ring */}
        <div className="mic-wrapper">
          {/* Animated state rings */}
          <div className="ring ring--1" aria-hidden="true" />
          <div className="ring ring--2" aria-hidden="true" />
          <div className="ring ring--3" aria-hidden="true" />

          <button
            id="mic-button"
            className="mic-btn"
            onClick={handleMicClick}
            aria-label={
              sessionState === "idle"
                ? "Start hands-free session"
                : `Session active — ${stateLabel}`
            }
            disabled={isActive && sessionState !== "idle" && sessionState !== "done"}
          >
            <span className="mic-icon">
              <MicIcon />
            </span>
          </button>
        </div>

        {/* State label — the only text shown during a session */}
        <div className="status-block" aria-live="polite" aria-atomic="true">
          <p className="state-label">{stateLabel}</p>
          {stepLabel && <p className="step-label">{stepLabel}</p>}
        </div>

        {/* Hint text when idle */}
        {!isActive && sessionState === "idle" && (
          <p className="hint">
            Say <em>"next"</em>, <em>"repeat"</em>, <em>"go back"</em>, or ask a question.
          </p>
        )}

        {/* Stop button — always visible once session starts */}
        {isActive && (
          <button
            id="stop-button"
            className="stop-btn"
            onClick={handleStop}
            aria-label="End session"
          >
            <StopIcon />
            <span>End session</span>
          </button>
        )}
      </main>

      {/* Procedure name badge */}
      {isActive && (
        <div className="procedure-badge" aria-label="Current procedure">
          ☕ Cold Brew Coffee
        </div>
      )}
    </div>
  );
}
