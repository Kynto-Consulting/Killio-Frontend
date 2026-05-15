"use client";

import {
  useState,
  useCallback,
  useMemo,
  useId,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { validateField, applyTransform } from "./use-input";
import type {
  FormSchema,
  FormReturn,
  FormFieldSchemas,
  FormValues,
  InputSchema,
  InputHTMLProps,
  InputReturn,
} from "./dsl.types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

type FieldState = {
  value: string | number;
  error: string | null;
  touched: boolean;
  dirty: boolean;
};

function buildInitialState<TFields extends FormFieldSchemas>(
  fields: TFields
): Record<string, FieldState> {
  const state: Record<string, FieldState> = {};
  for (const key of Object.keys(fields)) {
    const schema = fields[key];
    state[key] = {
      value: schema.defaultValue ?? (schema.type === "number" ? 0 : ""),
      error: null,
      touched: false,
      dirty: false,
    };
  }
  return state;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useForm — multi-field form state machine driven by a JSON schema.
 *
 * Handles per-field validation, cross-field validation, and async submission.
 * Each field in `return.fields` has the same interface as a standalone useInput.
 *
 * @example
 * const form = useForm({
 *   fields: {
 *     email: { type: 'email', constraints: { required: true } },
 *     password: { type: 'password', constraints: { required: true, minLength: 8 } },
 *   },
 *   submit: async ({ values }) => {
 *     await signIn(values.email, values.password)
 *   },
 * })
 * <form onSubmit={form.submit}>
 *   <input {...form.fields.email.inputProps} />
 *   <input {...form.fields.password.inputProps} />
 * </form>
 */
export function useForm<TFields extends FormFieldSchemas>(
  schema: FormSchema<TFields>
): FormReturn<TFields> {
  const fieldKeys = Object.keys(schema.fields) as Array<keyof TFields & string>;

  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>(
    () => buildInitialState(schema.fields)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Stable id base (one per form)
  const baseId = useId();

  // ── Validation helpers ───────────────────────────────────────────────────

  const runFieldValidation = useCallback(
    (key: string, value: string | number): string | null => {
      const s = schema.fields[key] as InputSchema;
      const transformed =
        s.type !== "number" && s.transform
          ? applyTransform(String(value), s.transform)
          : value;
      return validateField(transformed, s.constraints, s.type, s.messages);
    },
    [schema.fields]
  );

  const runMatchValidation = useCallback(
    (key: string, value: string | number, states: Record<string, FieldState>): string | null => {
      const constraints = (schema.fields[key] as InputSchema).constraints;
      if (!constraints?.match) return null;
      const matchKey = constraints.match;
      const matchValue = states[matchKey]?.value ?? "";
      if (value !== matchValue) {
        return `Must match ${matchKey}.`;
      }
      return null;
    },
    [schema.fields]
  );

  // ── Per-field handlers (memoised per key) ────────────────────────────────

  const fields = useMemo(() => {
    const result: Record<string, InputReturn<string | number>> = {};

    for (const key of fieldKeys) {
      const s = schema.fields[key] as InputSchema;
      const validateOn = s.validateOn ?? "blur";
      const fieldId = `${baseId}-${key}`;
      const errorId = `${fieldId}-error`;

      const setValue = (newValue: string | number) => {
        setFieldStates((prev) => {
          const next = { ...prev };
          const current = { ...prev[key], value: newValue, dirty: true };

          if (
            validateOn === "change" ||
            (validateOn === "blur" && prev[key].touched)
          ) {
            current.error =
              runFieldValidation(key, newValue) ??
              runMatchValidation(key, newValue, next);
          }
          next[key] = current;
          return next;
        });
      };

      const handleChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => {
        const raw: string | number =
          s.type === "number" ? Number(e.target.value) : e.target.value;
        setValue(raw);
      };

      const handleBlur = () => {
        setFieldStates((prev) => {
          const current = prev[key];
          const err =
            runFieldValidation(key, current.value) ??
            runMatchValidation(key, current.value, prev);
          return {
            ...prev,
            [key]: { ...current, touched: true, error: err },
          };
        });
      };

      const reset = () => {
        setFieldStates((prev) => ({
          ...prev,
          [key]: {
            value: s.defaultValue ?? (s.type === "number" ? 0 : ""),
            error: null,
            touched: false,
            dirty: false,
          },
        }));
      };

      const validate = (): boolean => {
        let err: string | null = null;
        setFieldStates((prev) => {
          err =
            runFieldValidation(key, prev[key].value) ??
            runMatchValidation(key, prev[key].value, prev);
          return {
            ...prev,
            [key]: { ...prev[key], touched: true, error: err },
          };
        });
        return err === null;
      };

      const disabled =
        typeof s.disabled === "function" ? s.disabled() : (s.disabled ?? false);
      const state = fieldStates[key];

      const isRequired = !!s.constraints?.required;
      const isEmpty =
        typeof state.value === "string" ? state.value.trim().length === 0 : false;

      const inputProps: InputHTMLProps = {
        id: fieldId,
        value: state.value as string | number,
        onChange: handleChange,
        onBlur: handleBlur,
        disabled,
        readOnly: s.readOnly ?? false,
        placeholder: s.placeholder,
        type: s.type === "textarea" ? undefined : s.type,
        "aria-invalid": state.error !== null && state.touched,
        "aria-describedby":
          state.error && state.touched ? errorId : undefined,
      };

      result[key] = {
        value: state.value,
        setValue,
        error: state.error,
        valid: state.touched ? state.error === null : !isRequired && isEmpty,
        dirty: state.dirty,
        touched: state.touched,
        reset,
        validate,
        id: fieldId,
        inputProps,
        errorProps: { id: errorId, role: "alert" as const },
      };
    }

    return result as unknown as FormReturn<TFields>["fields"];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldStates, fieldKeys, baseId, runFieldValidation, runMatchValidation]);

  // ── Submit ───────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setFieldStates(buildInitialState(schema.fields));
    setFormError(null);
    setIsSubmitting(false);
  }, [schema.fields]);

  const submit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (isSubmitting) return;

      // 1. Touch and validate all fields
      let allValid = true;
      const snapValues: Record<string, string | number> = {};

      setFieldStates((prev) => {
        const next = { ...prev };
        for (const key of fieldKeys) {
          const current = prev[key];
          const err =
            runFieldValidation(key, current.value) ??
            runMatchValidation(key, current.value, prev);
          if (err) allValid = false;
          next[key] = { ...current, touched: true, error: err };
          snapValues[key] = current.value;
        }
        return next;
      });

      if (!allValid) return;

      // 2. Cross-field validation
      if (schema.crossValidate) {
        const crossErrors = schema.crossValidate(
          snapValues as FormValues<TFields>
        );
        const hasCrossErrors = Object.values(crossErrors).some(Boolean);
        if (hasCrossErrors) {
          setFieldStates((prev) => {
            const next = { ...prev };
            for (const [k, msg] of Object.entries(crossErrors)) {
              if (msg && next[k]) {
                next[k] = { ...next[k], error: msg, touched: true };
              }
            }
            return next;
          });
          return;
        }
      }

      // 3. Run the submit handler
      setIsSubmitting(true);
      setFormError(null);
      try {
        await schema.submit({
          values: snapValues as FormValues<TFields>,
          reset,
        });
        if (schema.resetOnSuccess) reset();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setFormError(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSubmitting, fieldKeys, runFieldValidation, runMatchValidation, schema, reset]
  );

  // ── Derived state ────────────────────────────────────────────────────────

  const isDirty = fieldKeys.some((k) => fieldStates[k].dirty);
  const isValid = fieldKeys.every((k) => fieldStates[k].error === null);
  const values = useMemo(
    () =>
      Object.fromEntries(
        fieldKeys.map((k) => [k, fieldStates[k].value])
      ) as FormValues<TFields>,
    [fieldStates, fieldKeys]
  );

  return {
    fields,
    submit,
    reset,
    isSubmitting,
    formError,
    isDirty,
    isValid,
    values,
  };
}
