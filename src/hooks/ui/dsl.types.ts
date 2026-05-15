/**
 * Killio Unified UI DSL — Type Definitions
 *
 * Core contract for useInput, useForm, useModal, useConfirm,
 * useListField and useAsyncAction. All hooks accept a JSON schema
 * (the "DSL") and return a typed state bag.
 */

import type { ChangeEvent, FormEvent } from "react";

// ─── Shared primitives ────────────────────────────────────────────────────────

export type InputType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "url"
  | "tel"
  | "search"
  | "textarea"
  | "hidden";

/** A constraint that can be a bare value or carry a custom message. */
export type WithMessage<T> = T | { value: T; message: string };

/** Built-in string transforms applied BEFORE validation. */
export type BuiltinTransform =
  | "trim"
  | "lowercase"
  | "uppercase"
  | "trim-lower"
  | "trim-upper";

// ─── Input DSL ────────────────────────────────────────────────────────────────

/**
 * Full constraint set for a single field.
 * Every rule accepts a bare value (uses the default message)
 * or an object { value, message } to override the error text.
 */
export interface InputConstraints {
  required?: boolean | { message?: string };
  minLength?: WithMessage<number>;
  maxLength?: WithMessage<number>;
  /** Only meaningful when type === "number" */
  min?: WithMessage<number>;
  /** Only meaningful when type === "number" */
  max?: WithMessage<number>;
  /** Regex the value must satisfy */
  pattern?: WithMessage<RegExp>;
  /** RFC-5322-style email check (shorthand for pattern) */
  email?: boolean | { message?: string };
  /** Loose URL check (must start with http/https) */
  url?: boolean | { message?: string };
  /** Value must not contain whitespace characters */
  noWhitespace?: boolean | { message?: string };
  /** a-z, A-Z, 0-9 only */
  alphanumeric?: boolean | { message?: string };
  /**
   * Field must equal another field in the same form.
   * Only enforced by useForm — ignored by standalone useInput.
   */
  match?: string;
  /**
   * Arbitrary synchronous validator.
   * Return a string to signal an error; return null/undefined for valid.
   */
  custom?: (value: string) => string | null | undefined;
}

/**
 * Override the default English validation messages for a field.
 * Useful for i18n: pass translated strings without touching constraints.
 *
 * @example
 * const email = useInput({
 *   type: "email",
 *   constraints: { required: true, email: true },
 *   messages: {
 *     required: t("validation.required"),
 *     email:    t("validation.email"),
 *   },
 * })
 */
export interface InputMessages {
  required?: string;
  minLength?: string;
  maxLength?: string;
  /** Numeric min constraint message */
  min?: string;
  /** Numeric max constraint message */
  max?: string;
  email?: string;
  url?: string;
  pattern?: string;
  noWhitespace?: string;
  alphanumeric?: string;
}

export interface InputSchema<T extends string | number = string> {
  type: InputType;
  defaultValue?: T;
  placeholder?: string;
  disabled?: boolean | (() => boolean);
  readOnly?: boolean;
  /** Applied to the raw string before validation. */
  transform?: BuiltinTransform | ((raw: string) => string);
  constraints?: InputConstraints;
  /**
   * When to run validation:
   *  - "blur"   → on first blur, then on every change (default)
   *  - "change" → on every keystroke
   *  - "submit" → only when the form/field is explicitly submitted
   */
  validateOn?: "blur" | "change" | "submit";
  /**
   * Override default validation error messages (useful for i18n).
   * Takes precedence over the built-in English defaults but is
   * overridden by explicit `{ value, message }` objects in `constraints`.
   */
  messages?: InputMessages;
}

// ─── Input return ─────────────────────────────────────────────────────────────

export interface InputHTMLProps {
  id: string;
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  disabled: boolean;
  readOnly: boolean;
  placeholder?: string;
  /** undefined when type === "textarea" */
  type?: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
}

export interface InputReturn<T extends string | number = string> {
  value: T;
  setValue: (v: T) => void;
  error: string | null;
  /** True when touched and no error (or not required + empty) */
  valid: boolean;
  dirty: boolean;
  touched: boolean;
  /** Resets to defaultValue, clears error/touched/dirty */
  reset: () => void;
  /**
   * Imperatively trigger validation (marks as touched).
   * Returns true if valid.
   */
  validate: () => boolean;
  /** Stable auto-generated id (useId) */
  id: string;
  /** Spread directly onto <input> or <textarea> */
  inputProps: InputHTMLProps;
  /** Spread onto the error <p>: id + role="alert" */
  errorProps: { id: string; role: "alert" };
}

// ─── Form DSL ─────────────────────────────────────────────────────────────────

export type FormFieldSchemas = Record<string, InputSchema<string | number>>;

/**
 * Derives the value-map type from a schema map.
 * Fields with `type: "number"` resolve to `number`; all others resolve to `string`.
 * This avoids the `string | number` widening that TypeScript applies when
 * inferring the `T` generic from a concrete object literal.
 */
export type FormValues<TFields extends FormFieldSchemas> = {
  [K in keyof TFields]: TFields[K]["type"] extends "number" ? number : string;
};

export interface FormSubmitContext<TFields extends FormFieldSchemas> {
  values: FormValues<TFields>;
  /** Reset the form from inside the submit handler */
  reset: () => void;
}

export interface FormSchema<TFields extends FormFieldSchemas> {
  fields: TFields;
  submit: (ctx: FormSubmitContext<TFields>) => Promise<void> | void;
  /** Reset all fields after a successful submission */
  resetOnSuccess?: boolean;
  /**
   * Cross-field validation run after per-field validation passes.
   * Return a record of fieldName → errorMessage for any violations.
   */
  crossValidate?: (values: FormValues<TFields>) => Partial<Record<keyof TFields, string>>;
}

// ─── Form return ──────────────────────────────────────────────────────────────

export type FormFieldsReturn<TFields extends FormFieldSchemas> = {
  [K in keyof TFields]: InputReturn<
    TFields[K] extends InputSchema<infer T> ? T : string
  >;
};

export interface FormReturn<TFields extends FormFieldSchemas> {
  fields: FormFieldsReturn<TFields>;
  submit: (e?: FormEvent) => Promise<void>;
  reset: () => void;
  isSubmitting: boolean;
  /** Top-level error from the submit handler (not a field error) */
  formError: string | null;
  isDirty: boolean;
  isValid: boolean;
  values: FormValues<TFields>;
}

// ─── Modal DSL ────────────────────────────────────────────────────────────────

export type ModalSize = "xs" | "sm" | "md" | "lg" | "xl" | "full";

export type ModalVariant = "default" | "destructive" | "success" | "warning";

export interface ModalConfirmAction<TData> {
  label: string | ((data: TData) => string);
  variant?: ModalVariant;
  /** Return true to block close (e.g. validation failed) */
  disabled?: (data: TData) => boolean;
  action: (data: TData, close: () => void) => Promise<void> | void;
}

export interface ModalCancelAction<TData> {
  label?: string;
  action?: (data: TData) => void;
}

export interface ModalSchema<TData = void> {
  title: string | ((data: TData) => string);
  /** Default: "md" */
  size?: ModalSize;
  /** Default: true */
  closeable?: boolean;
  /** Default: true — clicking the backdrop closes the modal */
  closeOnBackdrop?: boolean;
  /** Default: true — pressing Escape closes the modal */
  closeOnEsc?: boolean;
  /** Called after the modal becomes open */
  onOpen?: (data: TData) => void | Promise<void>;
  /** Called after the modal closes */
  onClose?: (reason: "confirm" | "cancel" | "backdrop" | "esc" | "programmatic") => void;
  confirm?: ModalConfirmAction<TData>;
  cancel?: ModalCancelAction<TData>;
  /** Reset internal isSubmitting/error on each open */
  resetOnOpen?: boolean;
}

// ─── Modal return ─────────────────────────────────────────────────────────────

export interface ModalReturn<TData = void> {
  isOpen: boolean;
  /** Open the modal, optionally passing data payload */
  open: (data?: TData) => void;
  close: (reason?: "programmatic") => void;
  /** Trigger the confirm action */
  confirm: () => Promise<void>;
  data: TData | null;
  isSubmitting: boolean;
  /** Error thrown by the confirm action */
  error: string | null;
  clearError: () => void;
  /** Resolved title string */
  title: string;
  /** Useful for spreading onto a wrapper element */
  overlayProps: {
    onClick: (e: React.MouseEvent) => void;
    "aria-hidden": true;
  };
}

// ─── Confirm DSL ─────────────────────────────────────────────────────────────

export type ConfirmVariant = "default" | "destructive" | "warning";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /**
   * When set, the user must type this exact string before confirming.
   * Useful for destructive operations.
   */
  requireTyping?: string;
  /** Async action to run on confirm (before resolving the promise) */
  onConfirm?: () => Promise<void> | void;
}

export interface ConfirmReturn {
  /**
   * Open the dialog and return a promise.
   * Resolves true when confirmed, false when cancelled.
   */
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  /** Mount this component anywhere in your tree */
  ConfirmDialog: React.FC;
}

// ─── ListField DSL ────────────────────────────────────────────────────────────

export interface ListFieldSchema<T> {
  /** Initial list items */
  initialItems?: T[];
  maxItems?: number;
  /**
   * Equality comparator for the `unique` check.
   * Return true if items a and b are considered duplicates.
   */
  unique?: (a: T, b: T) => boolean;
  /** Per-item validator; return error string or null */
  validate?: (item: T, index: number, all: T[]) => string | null;
}

export interface ListFieldReturn<T> {
  items: T[];
  /** Add an item (respects maxItems + unique constraints) */
  add: (item: T) => boolean;
  /** Remove by index */
  remove: (index: number) => void;
  /** Update item at index */
  update: (index: number, item: T) => void;
  /** Move item from one index to another */
  move: (from: number, to: number) => void;
  clear: () => void;
  reset: () => void;
  /** Per-item errors (null = valid) */
  errors: Array<string | null>;
  /** True when every item is valid */
  isValid: boolean;
  /** Run validate() on all items; returns true if all valid */
  validateAll: () => boolean;
  isFull: boolean;
}

// ─── AsyncAction DSL ─────────────────────────────────────────────────────────

export interface AsyncActionOptions<TResult = void> {
  onSuccess?: (result: TResult) => void;
  onError?: (err: Error) => void;
  /** Debounce in ms — prevents double-submit */
  debounceMs?: number;
}

export interface AsyncActionReturn<TPayload, TResult = void> {
  run: (payload: TPayload) => Promise<TResult | undefined>;
  isPending: boolean;
  error: string | null;
  clearError: () => void;
  /** Reset isPending + error */
  reset: () => void;
}
