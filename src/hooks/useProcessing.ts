"use client";

import { useCallback, useRef, useState } from "react";
import { AppError, type CancellationToken, type ProgressState } from "@/lib/types";
import { SimpleCancellation } from "@/lib/utils";

interface RunContext {
  token: CancellationToken;
  report: (percent: number | null, label?: string) => void;
}

export interface ProcessingApi {
  state: ProgressState;
  error: AppError | null;
  clearError: () => void;
  run: <T>(label: string, work: (context: RunContext) => Promise<T>) => Promise<T | null>;
  cancel: () => void;
}

const IDLE: ProgressState = { active: false, label: "", percent: null };

/**
 * Verwaltet Fortschrittsanzeige, Abbruch und Fehlerbehandlung für
 * längere Verarbeitungsvorgänge. Die UI bleibt bedienbar.
 */
export function useProcessing(): ProcessingApi {
  const [state, setState] = useState<ProgressState>(IDLE);
  const [error, setError] = useState<AppError | null>(null);
  const tokenRef = useRef<SimpleCancellation | null>(null);

  const run = useCallback(
    async <T>(label: string, work: (context: RunContext) => Promise<T>): Promise<T | null> => {
      setError(null);
      setState({ active: true, label, percent: 0 });
      const token = new SimpleCancellation();
      tokenRef.current = token;

      try {
        const result = await work({
          token,
          report: (percent, progressLabel) => {
            if (token.cancelled) return;
            setState({ active: true, label: progressLabel ?? label, percent });
          },
        });
        if (!token.cancelled) setState(IDLE);
        else setState(IDLE);
        return result;
      } catch (caught) {
        setState(IDLE);
        if (caught instanceof AppError) {
          if (caught.code !== "CANCELLED") setError(caught);
        } else {
          console.error(caught);
          setError(new AppError("UNKNOWN", caught instanceof Error ? caught.message : undefined));
        }
        return null;
      } finally {
        tokenRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    if (tokenRef.current) tokenRef.current.cancelled = true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { state, error, clearError, run, cancel };
}
