/**
 * Messages the app itself hands to the assistant, as if the person had typed them: a spoken order
 * after the wake phrase, a recurring prompt whose time has come. Whoever shows the assistant
 * (ActiveListeningHost) listens here; whoever has an order pushes it.
 */
type Listener = (text: string) => void;

const listeners = new Set<Listener>();

export const assistantOrders = {
  /** Returns false when nothing is showing the assistant right now (signed out, not the app). */
  push(text: string): boolean {
    const order = text.trim();
    if (!order || listeners.size === 0) return false;
    listeners.forEach((listener) => listener(order));
    return true;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
