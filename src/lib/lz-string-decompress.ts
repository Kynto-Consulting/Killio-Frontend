// Minimal vendored LZString.decompressFromBase64 (pieroxy/lz-string, MIT).
// Obsidian Excalidraw files store their scene as an LZString-base64 block
// (```compressed-json```), so we need the matching decompressor — decompress
// only, no dependency.

const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const baseReverseDic: Record<string, Record<string, number>> = {};

function getBaseValue(alphabet: string, character: string): number {
  if (!baseReverseDic[alphabet]) {
    baseReverseDic[alphabet] = {};
    for (let i = 0; i < alphabet.length; i++) baseReverseDic[alphabet][alphabet.charAt(i)] = i;
  }
  return baseReverseDic[alphabet][character];
}

function _decompress(length: number, resetValue: number, getNextValue: (i: number) => number): string | null {
  const dictionary: string[] = [];
  let enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", result: string[] = [];
  let w: string, bits: number, resb: number, maxpower: number, power: number, c: string | number = "";
  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (let i = 0; i < 3; i += 1) dictionary[i] = String(i);

  bits = 0; maxpower = Math.pow(2, 2); power = 1;
  while (power !== maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  switch (bits) {
    case 0:
      bits = 0; maxpower = Math.pow(2, 8); power = 1;
      while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
      c = String.fromCharCode(bits); break;
    case 1:
      bits = 0; maxpower = Math.pow(2, 16); power = 1;
      while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
      c = String.fromCharCode(bits); break;
    case 2:
      return "";
  }
  dictionary[3] = c as string;
  w = c as string;
  result.push(c as string);

  while (true) {
    if (data.index > length) return "";
    bits = 0; maxpower = Math.pow(2, numBits); power = 1;
    while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }

    let cc: number = bits;
    switch (cc) {
      case 0:
        bits = 0; maxpower = Math.pow(2, 8); power = 1;
        while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
        dictionary[dictSize++] = String.fromCharCode(bits); cc = dictSize - 1; enlargeIn--; break;
      case 1:
        bits = 0; maxpower = Math.pow(2, 16); power = 1;
        while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
        dictionary[dictSize++] = String.fromCharCode(bits); cc = dictSize - 1; enlargeIn--; break;
      case 2:
        return result.join("");
    }

    if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }

    if (dictionary[cc]) { entry = dictionary[cc]; }
    else { if (cc === dictSize) { entry = w + w.charAt(0); } else { return null; } }
    result.push(entry);

    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;

    if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
  }
}

export function decompressFromBase64(input: string | null | undefined): string | null {
  if (input == null) return "";
  if (input === "") return null;
  return _decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)));
}
