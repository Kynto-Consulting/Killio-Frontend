"use client";

import { useState, useCallback, useId, type ChangeEvent } from "react";
import type {
  InputSchema,
  InputReturn,
  InputConstraints,
  InputMessages,
  BuiltinTransform,
} from "./dsl.types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;
const ALPHANUM_RE = /^[a-zA-Z0-9]+$/;

function resolveValue<T>(v: T | { value: T; message?: string }): T {
  return typeof v === "object" && v !== null && "value" in (v as object)
    ? (v as { value: T }).value
    : (v as T);
}

function resolveMessage<T>(
  v: T | { value: T; message?: string },
  fallback: string
): string {
  if (typeof v === "object" && v !== null && "message" in (v as object)) {
    return (v as { value: T; message?: string }).message ?? fallback;
  }
  return fallback;
}

export function applyTransform(
  raw: string,
  transform?: BuiltinTransform | ((raw: string) => string)
): string {
  if (!transform) return raw;
  if (typeof transform === "function") return transform(raw);
  switch (transform) {
    case "trim":       return raw.trim();
    case "lowercase":  return raw.toLowerCase();
    case "uppercase":  return raw.toUpperCase();
    case "trim-lower": return raw.trim().toLowerCase();
    case "trim-upper": return raw.trim().toUpperCase();
    default:           return raw;
  }
}

// ─── Core validator — called by both useInput and useForm ─────────────────────

/**
 * Validate a single field value.
 *
 * @param rawValue   - The current field value.
 * @param constraints - Constraint rules from the InputSchema.
 * @param type        - Input type (used for numeric min/max checks).
 * @param messages    - Optional message overrides (for i18n).
 *                      Takes precedence over built-in English defaults,
 *                      but is overridden by explicit `{ value, message }` objects.
 */
export function validateField(
  rawValue: string | number,
  constraints: InputConstraints = {},
  type: string = "text",
  messages?: InputMessages
): string | null {
  const str =
    typeof rawValue === "number" ? String(rawValue) : rawValue;

  const {
    required,
    minLength,
    maxLength,
    min,
    max,
    pattern,
    email,
    url,
    noWhitespace,
    alphanumeric,
    custom,
  } = constraints;

  // required
  if (required) {
    const empty = str.trim().length === 0;
    if (empty) {
      const msg =
        typeof required === "object" ? required.message : undefined;
      return msg ?? messages?.required ?? "This field is required.";
    }
  }

  // Don't run further checks on empty optional fields
  if (str.trim().length === 0) return null;

  // minLength
  if (minLength !== undefined) {
    const minVal = resolveValue(minLength);
    if (str.length < minVal) {
      return resolveMessage(
        minLength,
        messages?.minLength ?? `Must be at least ${minVal} characters.`
      );
    }
  }

  // maxLength
  if (maxLength !== undefined) {
    const maxVal = resolveValue(maxLength);
    if (str.length > maxVal) {
      return resolveMessage(
        maxLength,
        messages?.maxLength ?? `Must be at most ${maxVal} characters.`
      );
    }
  }

  // min/max (numeric)
  if (type === "number") {
    const num = Number(str);
    if (min !== undefined) {
      const minVal = resolveValue(min as typeof min);
      if (num < (minVal as number)) {
        return resolveMessage(min, messages?.min ?? `Must be at least ${minVal}.`);
      }
    }
    if (max !== undefined) {
      const maxVal = resolveValue(max as typeof max);
      if (num > (maxVal as number)) {
        return resolveMessage(max, messages?.max ?? `Must be at most ${maxVal}.`);
      }
    }
  }

  // pattern
  if (pattern !== undefined) {
    const re = resolveValue(pattern);
    if (!re.test(str)) {
      return resolveMessage(pattern, messages?.pattern ?? "Invalid format.");
    }
  }

  // email
  if (email) {
    if (!EMAIL_RE.test(str)) {
      const msg = typeof email === "object" ? email.message : undefined;
      return msg ?? messages?.email ?? "Must be a valid email address.";
    }
  }

  // url
  if (url) {
    if (!URL_RE.test(str)) {
      const msg = typeof url === "object" ? url.message : undefined;
      return msg ?? messages?.url ?? "Must be a valid URL (http/https).";
    }
  }

  // noWhitespace
  if (noWhitespace) {
    if (/\s/.test(str)) {
      const msg =
        typeof noWhitespace === "object" ? noWhitespace.message : undefined;
      return msg ?? messages?.noWhitespace ?? "Must not contain spaces.";
    }
  }

  // alphanumeric
  if (alphanumeric) {
    if (!ALPHANUM_RE.test(str)) {
      const msg =
        typeof alphanumeric === "object" ? alphanumeric.message : undefined;
      return msg ?? messages?.alphanumeric ?? "Must contain only letters and numbers.";
    }
  }

  // custom
  if (custom) {
    const result = custom(str);
    if (result) return result;
  }

  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useInput — single-field state machine driven by a JSON schema.
 *
 * @example
 * const email = useInput({ type: 'email', constraints: { required: true } })
 * <input {...email.inputProps} />
 * {email.error && <p {...email.errorProps}>{email.error}</p>}
 */
export function useInput<T extends string | number = string>(
  schema: InputSchema<T>
): InputReturn<T> {
  const defaultVal = (schema.defaultValue ??
    (schema.type === "number" ? 0 : "")) as T;

  const [value, setRawValue] = useState<T>(defaultVal);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  const validateOn = schema.validateOn ?? "blur";

  const runValidation = useCallback(
    (v: T): string | null => {
      const raw =
        typeof v === "number"
          ? v
          : applyTransform(String(v), schema.transform);
      return validateField(raw, schema.constraints, schema.type, schema.messages);
    },
    [schema.constraints, schema.transform, schema.type, schema.messages]
  );

  const setValue = useCallback(
    (v: T) => {
      setRawValue(v);
      setDirty(true);
      if (validateOn === "change" || (validateOn === "blur" && touched)) {
        setError(runValidation(v));
      }
    },
    [validateOn, touched, runValidation]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw =
        schema.type === "number"
          ? (Number(e.target.value) as T)
          : (e.target.value as T);
      setValue(raw);
    },
    [schema.type, setValue]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    setError(runValidation(value));
  }, [value, runValidation]);

  const reset = useCallback(() => {
    setRawValue(defaultVal);
    setError(null);
    setTouched(false);
    setDirty(false);
  }, [defaultVal]);

  const validate = useCallback((): boolean => {
    const err = runValidation(value);
    setError(err);
    setTouched(true);
    return err === null;
  }, [value, runValidation]);

  const disabled =
    typeof schema.disabled === "function"
      ? schema.disabled()
      : (schema.disabled ?? false);

  // "valid" means: touched AND no error — or not required AND empty (pristine)
  const isRequired =
    !!schema.constraints?.required;
  const isEmpty =
    typeof value === "string"
      ? value.trim().length === 0
      : false;
  const valid =
    touched
      ? error === null
      : !isRequired && isEmpty;

  return {
    value,
    setValue,
    error,
    valid,
    dirty,
    touched,
    reset,
    validate,
    id,
    inputProps: {
      id,
      value: value as string | number,
      onChange: handleChange,
      onBlur: handleBlur,
      disabled,
      readOnly: schema.readOnly ?? false,
      placeholder: schema.placeholder,
      type: schema.type === "textarea" ? undefined : schema.type,
      "aria-invalid": error !== null && touched,
      "aria-describedby": error && touched ? errorId : undefined,
    },
    errorProps: {
      id: errorId,
      role: "alert" as const,
    },
  };
}
