"use client";

import {
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

/** How long an error message stays on screen before it auto-hides (ms). */
export const ERROR_VISIBLE_MS = 5000;

/**
 * Auto-clear a transient banner after `ms`. Pair it with an existing
 * `useState<… | null>` so the setter stays a stable `useState` setter
 * (keeping React Hook dependency linting happy). Works for a plain string
 * banner or a richer object banner:
 *
 *   const [error, setError] = useState<string | null>(null);
 *   useAutoDismiss(error, setError);
 *
 *   const [feedback, setFeedback] = useState<{ msg: string } | null>(null);
 *   useAutoDismiss(feedback, setFeedback);
 *
 * Whenever a non-null value is set the timer (re)starts; clearing cancels it.
 */
export function useAutoDismiss<T>(
  value: T | null,
  setValue: Dispatch<SetStateAction<T | null>>,
  ms: number = ERROR_VISIBLE_MS
): void {
  useEffect(() => {
    if (!value) return;
    const id = setTimeout(() => setValue(null), ms);
    return () => clearTimeout(id);
  }, [value, setValue, ms]);
}

/**
 * Auto-dismiss field validation errors after a delay.
 *
 * - A message shows while its error is present in `errors` AND the field is
 *   `eligible` to show it (e.g. it was touched or a submit was attempted).
 * - After `ms` it hides itself even if the value is still invalid.
 * - If the field is later corrected (its error clears) the timer resets, so a
 *   fresh error can appear again for the full duration.
 *
 * Returns a `showErr(key)` helper yielding the message to render, or null.
 */
export function useTimedFieldErrors<K extends string>(
  errors: Partial<Record<K, string>>,
  eligible: (key: K) => boolean,
  ms: number = ERROR_VISIBLE_MS
): (key: K) => string | null {
  // Hidden keys live in a ref so the effect can reset them without a
  // synchronous setState; a forced re-render happens only when a timer fires.
  const hidden = useRef<Set<K>>(new Set());
  const timers = useRef<Partial<Record<K, ReturnType<typeof setTimeout>>>>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const activeKeys = (Object.keys(errors) as K[]).filter(
    (k) => errors[k] && eligible(k)
  );
  const activeSig = activeKeys.slice().sort().join("|");

  useEffect(() => {
    const active = new Set(activeKeys);

    // Start a hide timer for each newly-active error.
    active.forEach((k) => {
      if (!hidden.current.has(k) && !timers.current[k]) {
        timers.current[k] = setTimeout(() => {
          delete timers.current[k];
          hidden.current.add(k);
          rerender();
        }, ms);
      }
    });

    // Reset anything no longer active — the field was corrected.
    (Object.keys(timers.current) as K[]).forEach((k) => {
      if (!active.has(k)) {
        clearTimeout(timers.current[k]!);
        delete timers.current[k];
      }
    });
    hidden.current.forEach((k) => {
      if (!active.has(k)) hidden.current.delete(k);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSig, ms]);

  // Clear any pending timers on unmount.
  useEffect(
    () => () => {
      Object.values(timers.current).forEach((id) =>
        clearTimeout(id as ReturnType<typeof setTimeout>)
      );
    },
    []
  );

  return (key: K) =>
    eligible(key) && errors[key] && !hidden.current.has(key)
      ? errors[key]!
      : null;
}
