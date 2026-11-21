"use client";

/**
 * Onboarding illustrations: original line-art people in an editorial, hand-drawn spirit (thick ink outline, tube limbs,
 * blocky hands and sneakers, minimal faces with a jaw and a nose, solid hair) with Killio's lime as the strong accent.
 * Drawn here as SVG; colours are CSS variables so light and dark have their own palettes (see PALETTE_CSS).
 *
 * To add a scene: compose `<Person …/>`, `<MiniCard/>`, `<Column/>`, `<Plant/>`, `<Motion/>`, `<Sparkle/>` inside
 * `OnboardingArt` (viewBox 320×240, ground line at y≈228, a person is ~200 units tall at scale 1 and stands at y≈128).
 */

export const LIME = "var(--ob-lime)";
const SKINS = ["var(--ob-skin0)", "var(--ob-skin1)", "var(--ob-skin2)"] as const;
const SOFT = { blue: "var(--ob-blue)", pink: "var(--ob-pink)", sun: "var(--ob-sun)", red: "var(--ob-red)", violet: "var(--ob-violet)" } as const;

/**
 * Light: white paper, dark ink, lime blob. Dark: the drawing keeps dark ink and light paper on a lime tile (Killio's
 * accent in dark mode), instead of white strokes on black, which read as chalk.
 */
const PALETTE_CSS = `
.ob{--ob-ink:#14161f;--ob-paper:#ffffff;--ob-tile:transparent;--ob-lime:#d8ff72;--ob-blue:#bfd8ff;--ob-pink:#ffc6d6;--ob-sun:#ffe27a;--ob-red:#ff9d8a;--ob-violet:#d5c8ff;
--ob-skin0:#f6d2b5;--ob-skin1:#d9a27c;--ob-skin2:#9b6a4a;--ob-blob:#d8ff72;--ob-blob-o:.85;--ob-hair:#14161f;--ob-leaf:#8fd16a;color:var(--ob-ink)}
.dark .ob{--ob-tile:#d8ff72;--ob-lime:#9ccc2e;--ob-blue:#9cc4ff;--ob-pink:#ffb3c8;--ob-sun:#ffd84d;--ob-red:#ff8a75;--ob-violet:#c9b8ff;
--ob-blob:#ffffff;--ob-blob-o:.6;--ob-leaf:#3f9e5a}
`;
const HAIR = "var(--ob-hair)";
const paper = { fill: "var(--ob-paper)" } as const;
const INK = "var(--ob-ink)";

export type ArtScene = "welcome" | "about" | "goals" | "team" | "start" | "tour";

// ── Arms ───────────────────────────────────────────────────────────────────────────────────────
type ArmKind = "down" | "wave" | "cheer" | "point" | "reach" | "hold" | "carry" | "hip" | "think";
const ARMS: Record<ArmKind, { d: string; hand: [number, number] }> = {
  down: { d: "M-18 -46 Q-32 -20 -27 6", hand: [-27, 9] },
  wave: { d: "M-18 -46 Q-46 -54 -44 -88", hand: [-44, -92] },
  cheer: { d: "M-18 -46 Q-54 -64 -42 -104", hand: [-41, -108] },
  point: { d: "M-18 -46 Q-44 -42 -72 -52", hand: [-76, -53] },
  reach: { d: "M-18 -46 Q-50 -52 -66 -28", hand: [-68, -24] },
  hold: { d: "M-18 -46 Q-36 -16 -8 -10", hand: [-5, -10] },
  carry: { d: "M-18 -46 Q-30 -26 -2 -22", hand: [1, -22] },
  hip: { d: "M-18 -46 Q-40 -26 -20 -4", hand: [-17, -2] },
  think: { d: "M-18 -46 Q-38 -32 -12 -56", hand: [-9, -58] },
};

// ── Legs ───────────────────────────────────────────────────────────────────────────────────────
type LegsKind = "stand" | "stride" | "step" | "wide";
const LEGS: Record<LegsKind, { l: string; r: string; fl: number; fr: number }> = {
  stand: { l: "M-11 24 L-12 92", r: "M11 24 L13 92", fl: -12, fr: 13 },
  stride: { l: "M-9 24 L-22 92", r: "M9 24 L18 90", fl: -22, fr: 18 },
  step: { l: "M-9 24 Q-32 56 -24 92", r: "M9 24 L14 92", fl: -24, fr: 14 },
  wide: { l: "M-9 24 L-18 92", r: "M9 24 L22 92", fl: -18, fr: 22 },
};

function Tube({ d, color, w = 13 }: { d: string; color: string; w?: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={w} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={w - 6.5} strokeLinecap="round" />
    </>
  );
}

/** Arm with a long sleeve, or a short one (skin tube with a coloured stub at the shoulder, via pathLength dashes). */
function Sleeve({ d, top, skin, short }: { d: string; top: string; skin: string; short?: boolean }) {
  if (!short) return <Tube d={d} color={top} />;
  return (
    <>
      <Tube d={d} color={skin} />
      <path d={d} pathLength={100} fill="none" stroke={INK} strokeWidth={13} strokeDasharray="34 100" strokeLinecap="round" />
      <path d={d} pathLength={100} fill="none" stroke={top} strokeWidth={6.5} strokeDasharray="33 100" strokeLinecap="round" />
    </>
  );
}

// ── Head ───────────────────────────────────────────────────────────────────────────────────────
type FaceShape = "oval" | "square" | "heart";
const HEADS: Record<FaceShape, string> = {
  oval: "M-15 -80 C-16 -95 16 -95 15 -80 C15 -68 9 -54 0 -54 C-9 -54 -15 -68 -15 -80Z",
  square: "M-16 -82 C-16 -95 16 -95 16 -82 L15 -66 Q12 -54 0 -54 Q-12 -54 -15 -66Z",
  heart: "M-17 -82 C-17 -96 17 -96 17 -82 C17 -70 8 -54 0 -54 C-8 -54 -17 -70 -17 -82Z",
};

type HairKind = "short" | "bun" | "curly" | "long" | "cap" | "bob";

function Hair({ kind, color }: { kind: HairKind; color: string }) {
  const sw = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  const crown = "M-19 -76 Q-22 -102 0 -99 Q22 -102 19 -76 Q10 -88 -3 -87 Q-12 -85 -19 -76Z";
  switch (kind) {
    case "bun":
      return (<><circle cx="0" cy="-103" r="8" fill={color} {...sw} /><path d={crown} fill={color} {...sw} /></>);
    case "curly":
      return (<g fill={color} {...sw}>{[[-14, -89, 9], [0, -96, 10], [14, -89, 9], [-19, -77, 7], [19, -77, 7]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} />)}</g>);
    case "long":
      return (<><path d={crown} fill={color} {...sw} /><path d="M-19 -78 Q-28 -52 -17 -40 Q-12 -52 -14 -68Z" fill={color} {...sw} /><path d="M19 -78 Q28 -52 17 -40 Q12 -52 14 -68Z" fill={color} {...sw} /></>);
    case "bob":
      return (<><path d={crown} fill={color} {...sw} /><path d="M-19 -78 Q-24 -60 -18 -54 L-13 -62Z" fill={color} {...sw} /><path d="M19 -78 Q24 -60 18 -54 L13 -62Z" fill={color} {...sw} /></>);
    case "cap":
      return (<><path d="M-19 -80 Q-20 -102 0 -101 Q20 -102 19 -80Z" fill={color} {...sw} /><path d="M-19 -80 H31" stroke={INK} strokeWidth="4" strokeLinecap="round" /></>);
    default:
      return <path d={crown} fill={color} {...sw} />;
  }
}

type Mood = "happy" | "calm" | "wow" | "think";

function Face({ mood, glasses }: { mood: Mood; glasses?: boolean }) {
  const ln = { fill: "none", stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const };
  const eyes =
    mood === "happy" ? (<><path d="M-9 -73 q3 -4 6 0" {...ln} /><path d="M3 -73 q3 -4 6 0" {...ln} /></>)
    : mood === "wow" ? (<><circle cx="-6" cy="-73" r="3" fill={INK} /><circle cx="6" cy="-73" r="3" fill={INK} /><circle cx="-5.2" cy="-74" r="1" style={paper} /><circle cx="6.8" cy="-74" r="1" style={paper} /></>)
    : (<><circle cx="-6" cy="-73" r="2.2" fill={INK} /><circle cx="6" cy="-73" r="2.2" fill={INK} /></>);
  const brows =
    mood === "wow" ? (<><path d="M-10 -82 q4 -4 8 -1" {...ln} /><path d="M2 -83 q4 -3 8 1" {...ln} /></>)
    : mood === "think" ? (<><path d="M-10 -80 h8" {...ln} /><path d="M2 -84 q4 -3 8 0" {...ln} /></>)
    : (<><path d="M-10 -81 q4 -3 8 0" {...ln} /><path d="M2 -81 q4 -3 8 0" {...ln} /></>);
  const mouth =
    mood === "happy" ? <path d="M-6 -63 Q0 -54 6 -63Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    : mood === "wow" ? <ellipse cx="0" cy="-61" rx="3" ry="3.6" fill={INK} />
    : mood === "think" ? <path d="M-4 -61 q4 -1 8 1" {...ln} />
    : <path d="M-5 -62 Q0 -58 5 -62" {...ln} />;
  return (
    <>
      <path d="M1 -71 q3.5 3.5 -0.5 6.5" {...ln} strokeWidth="2" opacity="0.7" />
      {mood !== "think" ? <><ellipse cx="-11" cy="-66" rx="3.4" ry="2" fill={SOFT.pink} opacity="0.75" /><ellipse cx="11" cy="-66" rx="3.4" ry="2" fill={SOFT.pink} opacity="0.75" /></> : null}
      {eyes}{brows}{mouth}
      {glasses ? <g fill="none" stroke={INK} strokeWidth="2.2"><rect x="-12.5" y="-78" width="11" height="9" rx="2" /><rect x="1.5" y="-78" width="11" height="9" rx="2" /><path d="M-1.5 -74 H1.5" /></g> : null}
    </>
  );
}

/** Blocky hand: a small rounded square with a thumb tick, closer to a drawn mitten than a circle. */
function Hand({ x, y, skin }: { x: number; y: number; skin: string }) {
  return (
    <g strokeLinejoin="round">
      <rect x={x - 6.5} y={y - 6} width="13" height="12" rx="2.5" fill={skin} stroke={INK} strokeWidth="3" />
      <path d={`M${x - 1} ${y - 1} v4`} stroke={INK} strokeWidth="1.6" opacity="0.55" />
    </g>
  );
}

/**
 * Sneakers in 8 directions, as seen by the viewer: "front", "back", "left", "right" and the diagonals
 * ("front-left" = three-quarter view with the toe towards the viewer and to the left, etc.).
 * Asymmetric shapes are drawn with the toe to the RIGHT (+x) and mirrored for the left-hand directions.
 * Every shape is in the foot's own frame: the ankle opening is centred on the leg (x = 0), the sole sits on y = 0..3.
 */
export type Facing = "front" | "back" | "left" | "right" | "front-left" | "front-right" | "back-left" | "back-right";
export const FACINGS: readonly Facing[] = ["left", "front-left", "front", "front-right", "right", "back-right", "back", "back-left"];

interface ShoeShape { d: string; sole: string; details: string; tab?: string }
const SHOE_SHAPES: Record<"side" | "threeFront" | "threeBack" | "front" | "back", ShoeShape> = {
  // profile: collar rises to the heel, slopes over the tongue into a short rounded toe
  side: {
    d: "M-12 -3 C-13 -12 -11 -18 -7 -18 C-2 -18 3 -16 7 -14 C12 -11 16 -10 19 -9 C23 -8 24 -4 24 -1 C24 2 22 3 19 3 H-9 C-11 3 -12 1 -12 -3Z",
    sole: "M-11 -1 H23",
    details: "M1 -14 l5 2.2 M3 -17.5 l4 1.8",
  },
  // three-quarter from the front: toe foreshortened, a bit wider, laces facing the viewer
  threeFront: {
    d: "M-12 -3 C-13 -12 -11 -18 -5 -18 C0 -18 4 -15 8 -12 C13 -10 17 -8 18 -4 C19 0 17 3 13 3 H-9 C-11 3 -12 1 -12 -3Z",
    sole: "M-11 -1 H17",
    details: "M-1 -15 l6 2 M0 -11 l6 2 M2 -16 v6",
  },
  // three-quarter from behind: short toe, high heel counter with a pull tab
  threeBack: {
    d: "M-13 -3 C-14 -14 -11 -19 -5 -19 C1 -19 4 -15 6 -12 C9 -9 11 -7 11 -3 C11 1 9 3 6 3 H-10 C-12 3 -13 1 -13 -3Z",
    sole: "M-12 -1 H10",
    details: "M-9 -14 q3 4 1 9",
    tab: "M-13 -19 h5 v-5 h-5Z",
  },
  // facing the viewer: round toe cap and laces down the middle
  front: {
    d: "M-12 -2 C-12 -12 -8 -17 0 -17 C8 -17 12 -12 12 -2 C12 2 9 3 0 3 C-9 3 -12 2 -12 -2Z",
    sole: "M-11 -1 H11",
    details: "M-4 -14 h8 M-4 -10 h8 M0 -16 v8",
  },
  // seen from behind: heel counter, centre seam and pull tab
  back: {
    d: "M-10 -2 C-11 -14 -8 -19 0 -19 C8 -19 11 -14 10 -2 C10 2 8 3 0 3 C-8 3 -10 2 -10 -2Z",
    sole: "M-9 -1 H9",
    details: "M0 -17 v12",
    tab: "M-3 -19 h6 v-5 h-6Z",
  },
};

function shoeFor(facing: Facing): { shape: ShoeShape; mirror: boolean } {
  switch (facing) {
    case "right": return { shape: SHOE_SHAPES.side, mirror: false };
    case "left": return { shape: SHOE_SHAPES.side, mirror: true };
    case "front-right": return { shape: SHOE_SHAPES.threeFront, mirror: false };
    case "front-left": return { shape: SHOE_SHAPES.threeFront, mirror: true };
    case "back-right": return { shape: SHOE_SHAPES.threeBack, mirror: false };
    case "back-left": return { shape: SHOE_SHAPES.threeBack, mirror: true };
    case "front": return { shape: SHOE_SHAPES.front, mirror: false };
    default: return { shape: SHOE_SHAPES.back, mirror: false };
  }
}

export function Shoe({ x, y, color, facing = "left", part = "body" }: { x: number; y: number; color: string; facing?: Facing; part?: "body" | "halo" }) {
  const { shape, mirror } = shoeFor(facing);
  const transform = `translate(${x} ${y}) scale(${mirror ? -1 : 1} 1)`;
  if (part === "halo") {
    // Paper outline drawn BEFORE the front leg: it separates the front shoe from the back one without notching its own leg.
    return <path d={shape.d} transform={transform} style={paper} stroke="var(--ob-paper)" strokeWidth="8" strokeLinejoin="round" />;
  }
  return (
    <g transform={transform} strokeLinejoin="round" strokeLinecap="round">
      {shape.tab ? <path d={shape.tab} fill={color} stroke={INK} strokeWidth="2.6" /> : null}
      <path d={shape.d} fill={color} stroke={INK} strokeWidth="3.2" />
      <path d={shape.sole} stroke="var(--ob-paper)" strokeWidth="3" />
      <path d={shape.details} fill="none" stroke={INK} strokeWidth="1.8" opacity="0.6" />
    </g>
  );
}

// ── Clothes ────────────────────────────────────────────────────────────────────────────────────
type Outfit = "tee" | "hoodie" | "jacket" | "dress" | "stripes" | "turtle" | "vest" | "overalls" | "blazer" | "cardigan" | "polo" | "scarf";

const TORSO = "M-18 -52 Q0 -58 18 -52 Q23 -20 21 -4 L25 26 Q0 32 -25 26 L-21 -4 Q-23 -20 -18 -52Z";
const DRESS = "M-18 -52 Q0 -58 18 -52 Q22 -20 20 -6 L36 66 Q0 74 -36 66 L-20 -6 Q-22 -20 -18 -52Z";

function Outfits({ outfit, top }: { outfit: Outfit; top: string }) {
  const hatch = <path d="M11 -8 l7 -4 M12 2 l9 -5 M13 12 l9 -5" stroke={INK} strokeWidth="1.8" opacity="0.45" />;
  const fold = <path d="M-12 -36 q-2 14 1 26" fill="none" stroke={INK} strokeWidth="1.8" opacity="0.35" />;
  const collar = <path d="M-9 -54 Q0 -44 9 -54" fill="none" stroke={INK} strokeWidth="2.6" />;
  switch (outfit) {
    case "hoodie":
      return (<><path d="M-14 -53 Q0 -40 14 -53" fill={top} stroke={INK} strokeWidth="3" /><path d="M-6 -48 V-30 M6 -48 V-30" stroke={INK} strokeWidth="2.2" /><path d="M-14 4 H14 L11 20 H-11Z" fill="none" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />{hatch}</>);
    case "jacket":
      return (<><path d="M0 -50 V26" stroke={INK} strokeWidth="3" /><path d="M0 -50 L-10 -30 L-4 -22 M0 -50 L10 -30 L4 -22" fill="none" stroke={INK} strokeWidth="2.8" strokeLinejoin="round" /><path d="M-19 -4 h8 M11 -4 h8" stroke={INK} strokeWidth="2.2" />{hatch}</>);
    case "blazer":
      return (<><path d="M-8 -54 L0 -20 L8 -54Z" style={paper} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" /><path d="M-8 -54 L-14 -34 L-4 -16 L0 -20 M8 -54 L14 -34 L4 -16 L0 -20" fill="none" stroke={INK} strokeWidth="2.8" strokeLinejoin="round" /><circle cx="0" cy="-2" r="1.8" fill={INK} /><path d="M10 -2 h8 v5 h-8Z" fill="none" stroke={INK} strokeWidth="2" /><path d="M12 -34 l5 -2 l1 5 l-5 1Z" style={paper} stroke={INK} strokeWidth="1.6" />{fold}</>);
    case "cardigan":
      return (<><path d="M-7 -54 L-7 26 M7 -54 L7 26" stroke={INK} strokeWidth="2.8" /><rect x="-7" y="-54" width="14" height="80" style={paper} opacity="0.95" /><path d="M-7 -54 V26 M7 -54 V26" stroke={INK} strokeWidth="2.8" /><circle cx="0" cy="-30" r="1.8" fill={INK} /><circle cx="0" cy="-14" r="1.8" fill={INK} /><circle cx="0" cy="2" r="1.8" fill={INK} />{hatch}</>);
    case "polo":
      return (<><path d="M-10 -54 L-3 -44 L0 -54 L3 -44 L10 -54" fill={top} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" /><path d="M0 -44 V-26" stroke={INK} strokeWidth="2.2" /><circle cx="0" cy="-38" r="1.5" fill={INK} /><circle cx="0" cy="-30" r="1.5" fill={INK} />{hatch}{fold}</>);
    case "scarf":
      return (<><path d="M-14 -54 Q0 -42 14 -54 L16 -46 Q0 -34 -16 -46Z" style={paper} stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M8 -42 L14 -14 L6 -10 L2 -38Z" style={paper} stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M8 -26 h6 M7 -20 h6" stroke={INK} strokeWidth="1.8" opacity="0.5" />{hatch}</>);
    case "stripes":
      return (<><path d="M-21 -34 H21 M-22 -18 H22 M-22 -2 H22 M-24 14 H24" stroke={INK} strokeWidth="3" opacity="0.8" />{collar}</>);
    case "turtle":
      return (<><rect x="-10" y="-63" width="20" height="14" rx="3" fill={top} stroke={INK} strokeWidth="3" /><path d="M-10 -57 H10" stroke={INK} strokeWidth="1.8" opacity="0.5" />{hatch}{fold}</>);
    case "vest":
      return (<><path d="M-18 -52 L-4 -52 L0 -20 L-6 26 L-25 26 L-21 -4Z M18 -52 L4 -52 L0 -20 L6 26 L25 26 L21 -4Z" style={paper} stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M-4 -52 L0 -40 L4 -52" fill="none" stroke={INK} strokeWidth="2.6" /></>);
    case "overalls":
      return (<><path d="M-15 -4 H15 V26 H-15Z" fill={SOFT.blue} stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M-15 -4 L-12 -52 M15 -4 L12 -52" stroke={INK} strokeWidth="3" /><rect x="-6" y="4" width="12" height="9" rx="1.5" fill="none" stroke={INK} strokeWidth="2.2" /></>);
    case "dress":
      return (<><path d="M-25 26 Q0 32 25 26" fill="none" stroke={INK} strokeWidth="2.4" opacity="0.5" /><path d="M-30 66 q8 4 15 0 t15 0 t15 0 t15 0" fill="none" stroke={INK} strokeWidth="2.2" opacity="0.5" /><path d="M-8 -52 Q0 -44 8 -52" fill="none" stroke={INK} strokeWidth="2.6" /></>);
    default:
      return (<>{collar}<path d="M-25 14 Q0 20 25 14" fill="none" stroke={INK} strokeWidth="2" opacity="0.4" />{hatch}{fold}</>);
  }
}

interface PersonProps {
  x: number; y: number; s?: number; flip?: boolean;
  skin?: string; face?: FaceShape; hair?: HairKind; hairColor?: string; glasses?: boolean; headphones?: boolean; bag?: boolean; shoes?: string;
  /** Direction of each shoe as seen by the viewer, before `flip`; one value for both feet or [left foot, right foot]. */
  feet?: Facing | [Facing, Facing];
  top?: string; pants?: string; outfit?: Outfit; shorts?: boolean; sleeves?: "long" | "short";
  armL?: ArmKind; armR?: ArmKind; legs?: LegsKind; mood?: Mood;
  /** Degrees: the body leans around the hips; the head tilts around the neck. */
  lean?: number; tilt?: number;
}

/** Standing person, about 200 units tall (head top -100, feet +100), drawn around its own origin. */
function Person({
  x, y, s = 1, flip, skin = SKINS[0], face = "oval", hair = "short", hairColor = HAIR, glasses, headphones, bag, shoes = INK, feet = "front", top = LIME, pants = "var(--ob-paper)",
  outfit = "tee", shorts = false, sleeves = "long", armL = "down", armR = "down", legs = "stand", mood = "calm", lean = 0, tilt = 0,
}: PersonProps) {
  const fR = ARMS[armR];
  const L = LEGS[legs];
  const dress = outfit === "dress";
  const short = sleeves === "short";
  const bareLegs = dress || shorts;
  const [footL, footR] = Array.isArray(feet) ? feet : [feet, feet];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="0" cy="99" rx="36" ry="5" fill={INK} opacity="0.13" />
      {outfit === "hoodie" ? <path d="M-22 -56 Q0 -76 22 -56 L18 -44 H-18Z" fill={top} stroke={INK} strokeWidth="3" /> : null}
      {/* legs: bare below the knee when wearing shorts or a dress */}
      {/* back foot (right) first, then the front foot over it */}
      <Tube d={L.r} color={bareLegs ? skin : pants} w={bareLegs ? 16 : 20} />
      <Shoe x={L.fr} y={97} color={shoes} facing={footR} />
      <Shoe x={L.fl} y={97} color={shoes} facing={footL} part="halo" />
      <Tube d={L.l} color={bareLegs ? skin : pants} w={bareLegs ? 16 : 20} />
      <Shoe x={L.fl} y={97} color={shoes} facing={footL} />
      {shorts ? (<><Tube d={`M-9 24 L${(-9 + L.fl) / 2 - 1} 56`} color={pants} w={19} /><Tube d={`M9 24 L${(9 + L.fr) / 2 + 1} 56`} color={pants} w={19} /></>) : null}
      <g transform={`rotate(${lean} 0 24)`}>
        <g transform="scale(-1 1)"><Sleeve d={fR.d} top={top} skin={skin} short={short} /><Hand x={fR.hand[0]} y={fR.hand[1]} skin={skin} /></g>
        {bag ? <path d="M-14 -52 L22 20" stroke={INK} strokeWidth="5" opacity="0.9" /> : null}
        <path d={dress ? DRESS : TORSO} fill={top} stroke={INK} strokeWidth="3.4" />
        <Outfits outfit={outfit} top={top} />
        {bag ? <rect x="14" y="8" width="22" height="22" rx="4" fill={SOFT.sun} stroke={INK} strokeWidth="3" /> : null}
        <path d="M-6 -62 V-50 M6 -62 V-50" stroke={INK} strokeWidth="3" />
        <g transform={`rotate(${tilt} 0 -56)`}>
          <Hair kind={hair} color={hairColor} />
          <rect x="-21" y="-78" width="8" height="10" rx="3" fill={skin} stroke={INK} strokeWidth="2.6" />
          <rect x="13" y="-78" width="8" height="10" rx="3" fill={skin} stroke={INK} strokeWidth="2.6" />
          <path d={HEADS[face]} fill={skin} stroke={INK} strokeWidth="3.4" />
          <Hair kind={hair === "long" || hair === "curly" || hair === "bob" ? "short" : hair} color={hairColor} />
          <path d="M-8 -91 q4 -3 9 -2" fill="none" stroke="var(--ob-paper)" strokeWidth="2" opacity="0.5" />
          <Face mood={mood} glasses={glasses} />
          {headphones ? <><path d="M-19 -80 Q0 -108 19 -80" fill="none" stroke={INK} strokeWidth="4" /><rect x="-24" y="-82" width="9" height="14" rx="4" fill={SOFT.red} stroke={INK} strokeWidth="3" /><rect x="15" y="-82" width="9" height="14" rx="4" fill={SOFT.red} stroke={INK} strokeWidth="3" /></> : null}
        </g>
        <Sleeve d={ARMS[armL].d} top={top} skin={skin} short={short} />
        <Hand x={ARMS[armL].hand[0]} y={ARMS[armL].hand[1]} skin={skin} />
      </g>
    </g>
  );
}

// ── Props and decoration ───────────────────────────────────────────────────────────────────────
function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const leaf = { fill: "var(--ob-leaf)", stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-4 -18 Q-26 -36 -22 -62 Q-4 -56 -4 -18Z" {...leaf} />
      <path d="M0 -18 Q-6 -50 6 -74 Q18 -50 4 -18Z" {...leaf} />
      <path d="M4 -18 Q26 -34 28 -58 Q8 -54 4 -18Z" {...leaf} />
      <path d="M-16 -16 H16 L12 10 H-12Z" style={paper} stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M-14 -8 H14" stroke={INK} strokeWidth="2" opacity="0.4" />
    </g>
  );
}

function Motion({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${rot})`} stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none"><path d="M0 0 q-6 -6 -4 -14" /><path d="M8 -2 q-2 -9 4 -15" /><path d="M-8 6 q-9 -2 -14 -9" /></g>;
}

function Sparkle({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return <path d={`M${x} ${y - r}V${y + r}M${x - r} ${y}H${x + r}M${x - r * 0.6} ${y - r * 0.6}L${x + r * 0.6} ${y + r * 0.6}`} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />;
}

function Squiggle({ x, y, w = 56 }: { x: number; y: number; w?: number }) {
  const seg = w / 6;
  let d = `M${x} ${y}`;
  for (let i = 0; i < 6; i++) d += ` q${seg / 2} ${i % 2 ? 8 : -8} ${seg} 0`;
  return <path d={d} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
}

/** A card: ink outline, paper, a coloured tag and two text lines. */
function MiniCard({ x, y, w = 84, h = 54, rot = 0, tag = LIME, check = false }: { x: number; y: number; w?: number; h?: number; rot?: number; tag?: string; check?: boolean }) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`} strokeLinecap="round" strokeLinejoin="round">
      <rect x={x} y={y} width={w} height={h} rx="9" style={paper} stroke={INK} strokeWidth="3.4" />
      <rect x={x + 10} y={y + 11} width="26" height="9" rx="4.5" fill={tag} stroke={INK} strokeWidth="2" />
      <path d={`M${x + 10} ${y + 32}H${x + w * 0.7}M${x + 10} ${y + 42}H${x + w * 0.5}`} stroke={INK} strokeWidth="2.6" opacity="0.65" />
      {check ? <path d={`M${x + w - 26} ${y + 14}l6 6l11 -13`} fill="none" stroke={INK} strokeWidth="3.4" /> : null}
    </g>
  );
}

function Column({ x, y, w = 66, h = 120 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx="10" style={paper} stroke={INK} strokeWidth="3.4" />;
}

export function OnboardingArt({ scene, className }: { scene: ArtScene; className?: string }) {
  return (
    <svg viewBox="0 0 320 240" role="img" aria-hidden="true" focusable="false" className={`ob ${className ?? ""}`} style={{ color: INK }}>
      <style>{PALETTE_CSS}</style>
      <rect width="320" height="240" rx="22" style={{ fill: "var(--ob-tile)" }} />
      <path d="M38 150 C14 92 74 40 150 48 C232 56 296 92 284 160 C274 220 184 232 112 218 C70 210 50 188 38 150Z" style={{ fill: "var(--ob-blob)", opacity: "var(--ob-blob-o)" }} />
      <Squiggle x={22} y={214} />
      <Sparkle x={292} y={36} />
      <Sparkle x={34} y={56} r={7} />
      <path d="M30 228H300" stroke={INK} strokeWidth="3" strokeLinecap="round" opacity="0.5" />

      {scene === "welcome" && (
        <>
          <MiniCard x={192} y={104} rot={5} check />
          <MiniCard x={210} y={150} w={74} h={50} rot={-4} tag={SOFT.pink} />
          <Person x={122} y={128} face="heart" hair="bun" top={LIME} outfit="hoodie" sleeves="long" shoes={SOFT.pink} armL="cheer" armR="hip" legs="step" mood="happy" tilt={-7} lean={-4} skin={SKINS[0]} />
          <Motion x={72} y={36} rot={-25} />
          <Plant x={36} y={222} s={0.8} />
        </>
      )}

      {scene === "about" && (
        <>
          <Person x={100} y={128} face="square" hair="curly" top={SOFT.sun} outfit="stripes" sleeves="short" armL="hold" armR="hip" legs="stand" mood="calm" tilt={5} lean={2} skin={SKINS[2]} headphones />
          <Person x={216} y={128} s={0.97} flip face="oval" hair="bob" glasses top={SOFT.violet} outfit="blazer" shoes={SOFT.sun} armL="point" armR="down" legs="step" mood="happy" tilt={-5} lean={-3} skin={SKINS[1]} />
          <path d="M146 40 h58 a10 10 0 0 1 10 10 v20 a10 10 0 0 1 -10 10 h-30 l-12 12 v-12 h-16 a10 10 0 0 1 -10 -10 v-20 a10 10 0 0 1 10 -10Z" style={paper} stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
          <circle cx="164" cy="60" r="3" fill={INK} /><circle cx="176" cy="60" r="3" fill={INK} /><circle cx="188" cy="60" r="3" fill={INK} />
        </>
      )}

      {scene === "goals" && (
        <>
          <g>
            <circle cx="236" cy="92" r="40" style={paper} stroke={INK} strokeWidth="3.4" />
            <circle cx="236" cy="92" r="26" fill={LIME} stroke={INK} strokeWidth="3.2" />
            <circle cx="236" cy="92" r="11" style={paper} stroke={INK} strokeWidth="3.2" />
            <path d="M236 92 L286 40 M286 40 l-14 2 M286 40 l-2 14" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <Person x={112} y={128} flip face="heart" hair="long" top={SOFT.pink} outfit="dress" sleeves="short" shoes={SOFT.blue} armL="point" armR="hip" legs="stride" mood="wow" tilt={-6} lean={-5} skin={SKINS[1]} />
          <Plant x={288} y={222} s={0.7} />
        </>
      )}

      {scene === "team" && (
        <>
          <Person x={68} y={132} s={0.86} face="square" hair="cap" top={SOFT.blue} outfit="turtle" shorts armL="carry" armR="hip" legs="wide" mood="calm" tilt={4} skin={SKINS[1]} bag />
          <Person x={160} y={128} face="oval" hair="bun" top={LIME} outfit="polo" sleeves="short" shoes={SOFT.red} armL="cheer" armR="down" legs="step" mood="happy" tilt={-5} lean={-3} skin={SKINS[0]} />
          <Person x={252} y={132} s={0.86} flip face="heart" hair="curly" glasses top={SOFT.red} outfit="cardigan" armL="down" armR="hold" legs="stride" mood="happy" tilt={6} skin={SKINS[2]} />
          <path d="M68 34 Q114 12 160 30 Q206 12 252 34" fill="none" stroke={INK} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
        </>
      )}

      {scene === "start" && (
        <>
          <Column x={160} y={70} w={68} h={128} />
          <Column x={238} y={70} w={68} h={128} />
          <path d="M170 82h30M248 82h30" stroke={INK} strokeWidth="3" strokeLinecap="round" opacity="0.55" />
          <MiniCard x={168} y={96} w={52} h={40} check />
          <MiniCard x={168} y={144} w={52} h={40} tag={SOFT.pink} />
          <MiniCard x={246} y={96} w={52} h={40} tag={SOFT.sun} />
          <g transform="rotate(8 262 162)"><MiniCard x={238} y={146} w={52} h={40} tag={SOFT.blue} /></g>
          <path d="M200 60 Q234 34 268 58" fill="none" stroke={INK} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
          <path d="M268 58 l-9 -1 M268 58 l-3 -9" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <Person x={86} y={128} flip face="square" hair="short" glasses top={LIME} outfit="overalls" sleeves="short" shoes={SOFT.violet} armL="point" armR="carry" legs="stride" mood="think" tilt={-4} lean={-4} skin={SKINS[0]} />
        </>
      )}

      {scene === "tour" && (
        <>
          <g>
            <circle cx="236" cy="104" r="44" style={paper} stroke={INK} strokeWidth="3.4" />
            <path d="M236 70 L246 104 L236 138 L226 104Z" fill={LIME} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
            <circle cx="236" cy="104" r="4" fill={INK} />
          </g>
          <Person x={112} y={128} flip face="oval" hair="curly" top={SOFT.red} outfit="scarf" shoes={SOFT.sun} armL="reach" armR="hip" legs="step" mood="wow" tilt={-6} lean={-5} skin={SKINS[2]} />
          <Plant x={40} y={222} s={0.7} />
        </>
      )}
    </svg>
  );
}
