// Whisper token decoding (id -> text) from the model's own vocab.json + added_tokens.json.
// The vocabulary is GPT-2 style byte-level BPE: each token string is a sequence of bytes written with the
// GPT-2 "bytes_to_unicode" alphabet (printable bytes map to themselves, the others to U+0100 + n).
// Dependency-free; needs only TextDecoder (browser, worker and Node all have it).

export interface WhisperTokenizer {
  /** Text for a list of token ids. Special tokens (ids >= <|endoftext|>) are skipped. */
  decode(ids: ArrayLike<number>): string;
  /** Id of a token string such as "<|es|>", or undefined. */
  tokenToId(token: string): number | undefined;
  /** Raw token string for an id (special tokens included), or undefined. */
  idToToken(id: number): string | undefined;
  readonly vocabSize: number;
  readonly eot: number;
}

function buildByteDecoder(): Map<string, number> {
  // Same construction as GPT-2's bytes_to_unicode().
  const bs: number[] = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n++);
    }
  }
  const map = new Map<string, number>();
  for (let i = 0; i < bs.length; i++) map.set(String.fromCharCode(cs[i]), bs[i]);
  return map;
}

export function createTokenizer(vocab: Record<string, number>, addedTokens: Record<string, number> = {}): WhisperTokenizer {
  const byteDecoder = buildByteDecoder();
  const idToTok: string[] = [];
  const tokToId = new Map<string, number>();
  for (const [tok, id] of Object.entries(vocab)) {
    idToTok[id] = tok;
    tokToId.set(tok, id);
  }
  for (const [tok, id] of Object.entries(addedTokens)) {
    idToTok[id] = tok;
    tokToId.set(tok, id);
  }
  const eot = tokToId.get('<|endoftext|>');
  if (eot === undefined) throw new Error('vocabulary has no <|endoftext|> token');
  const utf8 = new TextDecoder('utf-8');
  return {
    vocabSize: idToTok.length,
    eot,
    tokenToId: (t) => tokToId.get(t),
    idToToken: (id) => idToTok[id],
    decode(ids) {
      const bytes: number[] = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id >= eot) continue;
        const tok = idToTok[id];
        if (tok === undefined) continue;
        for (const ch of tok) {
          const b = byteDecoder.get(ch);
          if (b !== undefined) bytes.push(b);
        }
      }
      return utf8.decode(new Uint8Array(bytes));
    },
  };
}
