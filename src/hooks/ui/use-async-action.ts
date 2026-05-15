"use client";

import { useState, useCallback, useRef } from "react";
import type { AsyncActionOptions, AsyncActionReturn } from "./dsl.types";

/**
 * useAsyncAction — lightweight async mutation wrapper.
 *
 * Handles isPending, error, debounce, onSuccess/onError callbacks.
 * Designed for non-form mutations (delete, archive, reorder, etc.)
 * where you need loading + error state without a full form schema.
 *
 * @example
 * const deleteBoard = useAsyncAction(
 *   async (id: string) => {
 *     await api.deleteBoard(id)
 *   },
 *   {
 *     onSuccess: () => toast('Board deleted', 'success'),
 *     onError:   (err) => toast(err.message, 'error'),
 *   }
 * )
 *
 * <button
 *   onClick={() => deleteBoard.run(board.id)}
 *   disabled={deleteBoard.isPending}
 * >
 *   {deleteBoard.isPending ? 'Deleting…' : 'Delete'}
 * </button>
 */
export function useAsyncAction<TPayload, TResult = void>(
  fn: (payload: TPayload) => Promise<TResult>,
  options: AsyncActionOptions<TResult> = {}
): AsyncActionReturn<TPayload, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optRef = useRef(options);
  optRef.current = options;

  // Debounce: track last fire time
  const lastRunRef = useRef<number>(0);

  const run = useCallback(
    async (payload: TPayload): Promise<TResult | undefined> => {
      const { debounceMs } = optRef.current;
      if (debounceMs) {
        const now = Date.now();
        if (now - lastRunRef.current < debounceMs) return undefined;
        lastRunRef.current = now;
      }
      if (isPending) return undefined;

      setIsPending(true);
      setError(null);

      try {
        const result = await fnRef.current(payload);
        optRef.current.onSuccess?.(result);
        return result;
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e.message);
        optRef.current.onError?.(e);
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [isPending]
  );

  const clearError = useCallback(() => setError(null), []);
  const reset = useCallback(() => {
    setIsPending(false);
    setError(null);
  }, []);

  return { run, isPending, error, clearError, reset };
}
