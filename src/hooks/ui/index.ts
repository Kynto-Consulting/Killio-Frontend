/**
 * Killio Unified UI Hooks
 *
 * useInput       — single-field state + validation DSL
 * useForm        — multi-field form with cross-validation + async submit
 * useModal       — modal lifecycle (open / close / confirm / ESC / backdrop)
 * useConfirm     — imperative promise-based confirmation dialog
 * useListField   — ordered array state with uniqueness + per-item validation
 * useAsyncAction — lightweight async mutation (loading + error + debounce)
 */

export { useInput } from "./use-input";
export { validateField, applyTransform } from "./use-input";

export { useForm } from "./use-form";

export { useModal, MODAL_SIZE_CLASS } from "./use-modal";

export { useConfirm } from "./use-confirm";

export { useListField } from "./use-list-field";

export { useAsyncAction } from "./use-async-action";

// Re-export all DSL types for consumers
export type {
  // Input
  InputType,
  InputSchema,
  InputMessages,
  InputReturn,
  InputHTMLProps,
  InputConstraints,
  BuiltinTransform,
  WithMessage,
  // Form
  FormSchema,
  FormReturn,
  FormFieldSchemas,
  FormValues,
  FormSubmitContext,
  // Modal
  ModalSchema,
  ModalReturn,
  ModalSize,
  ModalVariant,
  ModalConfirmAction,
  // Confirm
  ConfirmOptions,
  ConfirmReturn,
  ConfirmVariant,
  // List
  ListFieldSchema,
  ListFieldReturn,
  // Async
  AsyncActionOptions,
  AsyncActionReturn,
} from "./dsl.types";
