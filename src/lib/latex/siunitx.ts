// Text-mode subset of siunitx (\num, \si, \SI, \qty, \ang …). Pure.
// KaTeX has no siunitx, so units are rendered as plain Unicode text.

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺" };
const sup = (s: string): string => s.split("").map((c) => SUP[c] ?? c).join("");

const PREFIX: Record<string, string> = {
  yocto: "y", zepto: "z", atto: "a", femto: "f", pico: "p", nano: "n", micro: "µ", milli: "m", centi: "c", deci: "d",
  deca: "da", hecto: "h", kilo: "k", mega: "M", giga: "G", tera: "T", peta: "P", exa: "E",
};

const UNIT: Record<string, string> = {
  meter: "m", metre: "m", gram: "g", second: "s", ampere: "A", kelvin: "K", mole: "mol", candela: "cd", hertz: "Hz",
  newton: "N", pascal: "Pa", joule: "J", watt: "W", coulomb: "C", volt: "V", farad: "F", ohm: "Ω", siemens: "S",
  weber: "Wb", tesla: "T", henry: "H", lumen: "lm", lux: "lx", becquerel: "Bq", gray: "Gy", sievert: "Sv", katal: "kat",
  degreeCelsius: "°C", celsius: "°C", degree: "°", arcminute: "′", arcsecond: "″", radian: "rad", steradian: "sr",
  litre: "L", liter: "L", hour: "h", minute: "min", day: "d", tonne: "t", electronvolt: "eV", dalton: "Da",
  percent: "%", byte: "B", bit: "bit", angstrom: "Å", bar: "bar", atmosphere: "atm", astronomicalunit: "au",
};

/** `1.2e3` → `1.2 × 10³`, `+-` → `±`. */
export function formatNumber(raw: string): string {
  let s = raw.trim().replace(/\\pm/g, "±").replace(/\+-/g, "±").replace(/\\times/g, "×");
  s = s.replace(/^([+-]?[\d.,]*\d)\s*[eE]\s*([+-]?\d+)$/, (_m, mant: string, exp: string) => `${mant} × 10${sup(String(Number(exp)))}`);
  return s;
}

export function formatUnit(raw: string): string {
  const src = raw.trim();
  if (!src.includes("\\")) {
    // siunitx v3 allows plain input: m.s^-2, kg/m^3
    return src.replace(/\.(?=[A-Za-zµΩ°])/g, "·").replace(/\^\{?([+-]?\d+)\}?/g, (_m, n: string) => sup(n));
  }
  const parts: Array<{ sym: string; pow: number }> = [];
  let prefix = "";
  let denom = false;
  let pendingPow = 1;
  const re = /\\([A-Za-z]+)(?:\{([^}]*)\})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (PREFIX[name]) { prefix += PREFIX[name]; continue; }
    if (name === "per") { denom = true; continue; }
    if (name === "square") { pendingPow = 2; continue; }
    if (name === "cubic" || name === "cubed") { if (name === "cubic") pendingPow = 3; else if (parts.length) parts[parts.length - 1].pow *= 3; continue; }
    if (name === "squared") { if (parts.length) parts[parts.length - 1].pow *= 2; continue; }
    if (name === "tothe") { if (parts.length) parts[parts.length - 1].pow *= Number(m[2]) || 1; continue; }
    if (name === "raiseto") { pendingPow = Number(m[2]) || 1; continue; }
    const base = UNIT[name];
    if (base) {
      parts.push({ sym: prefix + base, pow: (denom ? -1 : 1) * pendingPow });
      prefix = "";
      pendingPow = 1;
    }
  }
  return parts.map((p) => (p.pow === 1 ? p.sym : `${p.sym}${sup(String(p.pow))}`)).join("·") || src;
}

/** `\ang{30}` → `30°`, `\ang{1;2;3}` → `1°2′3″`. */
export function formatAngle(raw: string): string {
  const bits = raw.trim().split(";");
  if (bits.length === 1) return `${formatNumber(bits[0])}°`;
  const marks = ["°", "′", "″"];
  return bits.map((b, i) => (b.trim() ? `${formatNumber(b)}${marks[i] ?? ""}` : "")).join("");
}
