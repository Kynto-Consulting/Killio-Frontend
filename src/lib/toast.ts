export type ToastVariant = "success" | "error" | "info";

export interface ToastEventDetail {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

export function toast(message: string, variant: ToastVariant = "info", duration = 3000) {
  const event = new CustomEvent<ToastEventDetail>("killio:toast", {
    detail: { message, variant, duration },
  });
  window.dispatchEvent(event);
}
