"use client";

import { useState, useCallback, useMemo } from "react";
import type { ListFieldSchema, ListFieldReturn } from "./dsl.types";

/**
 * useListField — ordered array field state machine.
 *
 * Manages add / remove / update / move operations with optional
 * uniqueness enforcement, max-item cap, and per-item validation.
 *
 * @example
 * const invites = useListField({
 *   maxItems: 20,
 *   unique: (a, b) => a.email === b.email,
 *   validate: item => item.email.includes('@') ? null : 'Invalid email',
 * })
 *
 * invites.add({ email: 'user@example.com', role: 'member' })
 * invites.remove(0)
 * invites.items // [...]
 */
export function useListField<T>(
  schema: ListFieldSchema<T> = {}
): ListFieldReturn<T> {
  const [items, setItems] = useState<T[]>(
    schema.initialItems ? [...schema.initialItems] : []
  );

  const { maxItems, unique, validate } = schema;

  // ── Add ──────────────────────────────────────────────────────────────────

  const add = useCallback(
    (item: T): boolean => {
      let added = false;
      setItems((prev) => {
        if (maxItems !== undefined && prev.length >= maxItems) return prev;
        if (unique && prev.some((existing) => unique(existing, item)))
          return prev;
        added = true;
        return [...prev, item];
      });
      return added;
    },
    [maxItems, unique]
  );

  // ── Remove ───────────────────────────────────────────────────────────────

  const remove = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Update ───────────────────────────────────────────────────────────────

  const update = useCallback((index: number, item: T) => {
    setItems((prev) => prev.map((existing, i) => (i === index ? item : existing)));
  }, []);

  // ── Move ─────────────────────────────────────────────────────────────────

  const move = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (
        from < 0 ||
        to < 0 ||
        from >= prev.length ||
        to >= prev.length ||
        from === to
      )
        return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  // ── Clear ────────────────────────────────────────────────────────────────

  const clear = useCallback(() => setItems([]), []);

  const reset = useCallback(
    () => setItems(schema.initialItems ? [...schema.initialItems] : []),
    [schema.initialItems]
  );

  // ── Validation ───────────────────────────────────────────────────────────

  const errors = useMemo<Array<string | null>>(
    () =>
      validate
        ? items.map((item, index, all) => validate(item, index, all))
        : items.map(() => null),
    [items, validate]
  );

  const isValid = errors.every((e) => e === null);

  const validateAll = useCallback((): boolean => {
    if (!validate) return true;
    return items.every(
      (item, index, all) => validate(item, index, all) === null
    );
  }, [items, validate]);

  const isFull =
    maxItems !== undefined ? items.length >= maxItems : false;

  return {
    items,
    add,
    remove,
    update,
    move,
    clear,
    reset,
    errors,
    isValid,
    validateAll,
    isFull,
  };
}
