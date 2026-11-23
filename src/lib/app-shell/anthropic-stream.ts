/**
 * Puts together the streamed events of one Anthropic Messages response (what the app's Claude bridge
 * returns). Pure, no imports: the events go in one by one, the assembled answer comes out.
 */

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface AssembledMessage {
  blocks: AnthropicBlock[];
  /** "end_turn", "tool_use", "max_tokens"… or null when the stream stopped without saying. */
  stopReason: string | null;
  /** Set when the stream carried an error event; the message is then incomplete. */
  error: string | null;
}

type Open = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; json: string };

export class AnthropicStreamAssembler {
  private readonly open = new Map<number, Open>();
  private readonly order: number[] = [];
  private stopReason: string | null = null;
  private error: string | null = null;

  /** Feeds one event. Returns the text it added to the visible answer, if any. */
  push(event: any): string {
    if (!event || typeof event !== "object") return "";
    switch (event.type) {
      case "content_block_start": {
        const index = Number(event.index);
        const block = event.content_block ?? {};
        if (block.type === "tool_use") this.open.set(index, { type: "tool_use", id: String(block.id ?? ""), name: String(block.name ?? ""), json: "" });
        else if (block.type === "text") this.open.set(index, { type: "text", text: typeof block.text === "string" ? block.text : "" });
        else return ""; // thinking and other blocks are not part of the answer
        this.order.push(index);
        return block.type === "text" && typeof block.text === "string" ? block.text : "";
      }
      case "content_block_delta": {
        const block = this.open.get(Number(event.index));
        const delta = event.delta ?? {};
        if (!block) return "";
        if (block.type === "text" && delta.type === "text_delta" && typeof delta.text === "string") {
          block.text += delta.text;
          return delta.text;
        }
        if (block.type === "tool_use" && delta.type === "input_json_delta" && typeof delta.partial_json === "string") block.json += delta.partial_json;
        return "";
      }
      case "message_delta":
        if (typeof event.delta?.stop_reason === "string") this.stopReason = event.delta.stop_reason;
        return "";
      case "error":
        this.error = String(event.error?.message ?? "The model call failed.");
        return "";
      default:
        return "";
    }
  }

  result(): AssembledMessage {
    const blocks: AnthropicBlock[] = [];
    for (const index of this.order) {
      const block = this.open.get(index)!;
      if (block.type === "text") {
        if (block.text) blocks.push({ type: "text", text: block.text });
        continue;
      }
      let input: Record<string, unknown> = {};
      try {
        const parsed = block.json.trim() ? JSON.parse(block.json) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed;
      } catch {
        // A tool call whose arguments did not arrive whole is reported as an error to the caller.
        return { blocks, stopReason: this.stopReason, error: this.error ?? `The call to ${block.name} arrived incomplete.` };
      }
      blocks.push({ type: "tool_use", id: block.id, name: block.name, input });
    }
    return { blocks, stopReason: this.stopReason, error: this.error };
  }
}
