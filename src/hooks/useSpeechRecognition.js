/**
 * useSpeechRecognition.js
 * Custom React hook that wraps the Web Speech API (browser-native, no cost).
 *
 * Supported: Chrome, Edge (not Firefox or Safari as of 2025)
 * Returns: { transcript, isListening, startListening, stopListening, error }
 */

import { useState, useRef, useCallback, useEffect } from "react";

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  // Hold a stable ref to the recognition instance across renders
  const recognitionRef = useRef(null);
  // Callback ref so startListening always calls the latest onResult
  const onResultRef = useRef(null);

  /** Initialize the SpeechRecognition instance once */
  const init = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Your browser doesn't support the Web Speech API. Please use Chrome or Edge.");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false; // Only fire on final results
    recognition.maxAlternatives = 1;
    recognition.continuous = false;     // Single utterance per listen cycle

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setIsListening(false);
      // Fire the callback registered by the session hook
      if (onResultRef.current) {
        onResultRef.current(text);
      }
    };

    recognition.onerror = (event) => {
      // "no-speech" is common and expected — don't treat it as an app crash
      if (event.error === "no-speech") {
        setError("no-speech");
      } else {
        setError(event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, []);

  /**
   * Start a single listen cycle.
   * @param {function} onResult - Called with the transcript string when speech ends
   */
  const startListening = useCallback(
    (onResult) => {
      setError(null);
      setTranscript("");
      onResultRef.current = onResult;

      if (!recognitionRef.current) {
        recognitionRef.current = init();
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          // Recognition may still be running if called too quickly
          console.warn("[speech] Recognition already started:", e.message);
        }
      }
    },
    [init]
  );

  /** Stop listening manually (e.g. when the app starts speaking) */
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return { transcript, isListening, startListening, stopListening, error };
}
