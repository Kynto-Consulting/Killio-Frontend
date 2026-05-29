// Map a leading emoji in a folder name to a Killio folder icon. Returns a
// preset lucide id when there's a sensible match, otherwise the raw emoji
// (FolderIconDisplay renders unmapped strings as an emoji glyph).

const EMOJI_RE = /^(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|[️\u{1F3FB}-\u{1F3FF}])*)/u;

/** Extract the leading emoji of a string (or null). */
export function leadingEmoji(name: string): string | null {
  const m = name.match(EMOJI_RE);
  return m ? m[1] : null;
}

/** Strip a leading emoji (+ following space) from a name. */
export function stripLeadingEmoji(name: string): string {
  return name.replace(EMOJI_RE, "").trim();
}

// Emoji → lucide icon name (PascalCase). Resolved dynamically against the full
// lucide-react set (see FolderIconPicker.lucideByName), so any valid lucide name
// renders — like Obsidian's icon support. Unmapped emojis fall back to the glyph.
const MAP: Array<{ icon: string; emojis: string[] }> = [
  { icon: "BookOpen", emojis: ["📚", "📖", "📕", "📗", "📘", "📙", "📔", "📓"] },
  { icon: "NotebookPen", emojis: ["🗒️", "📝", "✏️", "🖊️", "🖋️"] },
  { icon: "Brain", emojis: ["🧠"] },
  { icon: "Star", emojis: ["⭐", "🌟", "🌠"] },
  { icon: "Sparkles", emojis: ["✨", "💫", "🎇", "🎆"] },
  { icon: "Heart", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🖤", "💖", "💕"] },
  { icon: "Briefcase", emojis: ["💼", "🗃️"] },
  { icon: "Wrench", emojis: ["🛠️", "🔧", "🔨"] },
  { icon: "Cog", emojis: ["⚙️", "🧰"] },
  { icon: "Factory", emojis: ["🏭", "📠"] },
  { icon: "Image", emojis: ["🖼️", "🖌️"] },
  { icon: "Camera", emojis: ["📷", "📸"] },
  { icon: "Palette", emojis: ["🎨"] },
  { icon: "Music", emojis: ["🎵", "🎶", "🎷", "🎸", "🥁", "🎺"] },
  { icon: "Headphones", emojis: ["🎧"] },
  { icon: "Video", emojis: ["🎬", "📹", "🎞️", "📽️", "🎥"] },
  { icon: "Tv", emojis: ["📺"] },
  { icon: "Map", emojis: ["🗺️", "🧭"] },
  { icon: "MapPin", emojis: ["📍", "🏠", "🏡", "🏘️"] },
  { icon: "Building2", emojis: ["🏢", "🏛️", "🏗️", "🌆", "🏙️"] },
  { icon: "Globe", emojis: ["🌍", "🌎", "🌏", "🌐"] },
  { icon: "Rocket", emojis: ["🚀"] },
  { icon: "Flame", emojis: ["🔥"] },
  { icon: "Snowflake", emojis: ["❄️", "🧊"] },
  { icon: "Zap", emojis: ["⚡", "🔌"] },
  { icon: "Bug", emojis: ["🐛", "🐜", "🦟"] },
  { icon: "Skull", emojis: ["💀", "☠️"] },
  { icon: "Swords", emojis: ["⚔️", "🗡️", "🛡️"] },
  { icon: "Lightbulb", emojis: ["💡"] },
  { icon: "Clock", emojis: ["⏰", "⏱️", "⌛", "⏳", "🕐"] },
  { icon: "Calendar", emojis: ["📅", "📆", "🗓️"] },
  { icon: "Users", emojis: ["👥", "👨‍👩‍👧‍👦", "🧑‍🤝‍🧑"] },
  { icon: "User", emojis: ["👤", "🧑", "👨", "👩", "🧙", "🧚", "🦸"] },
  { icon: "FlaskConical", emojis: ["🧪", "⚗️", "🔬"] },
  { icon: "Gamepad2", emojis: ["🎮", "🕹️"] },
  { icon: "Dice5", emojis: ["🎲"] },
  { icon: "Trophy", emojis: ["🏆", "🥇"] },
  { icon: "Target", emojis: ["🎯"] },
  { icon: "Pin", emojis: ["📌"] },
  { icon: "Tag", emojis: ["🏷️"] },
  { icon: "Folder", emojis: ["📁", "📂", "🗂️"] },
  { icon: "FileText", emojis: ["📄", "📃", "📑"] },
  { icon: "Mail", emojis: ["📧", "✉️", "📨", "📩"] },
  { icon: "Phone", emojis: ["📱", "☎️", "📞"] },
  { icon: "Lock", emojis: ["🔒", "🔐", "🗝️", "🔑"] },
  { icon: "Search", emojis: ["🔍", "🔎"] },
  { icon: "Leaf", emojis: ["🍃", "🌿", "🌱", "☘️"] },
  { icon: "Trees", emojis: ["🌳", "🌲", "🎄"] },
  { icon: "Sun", emojis: ["☀️", "🌞"] },
  { icon: "Moon", emojis: ["🌙", "🌛", "🌜"] },
  { icon: "Cloud", emojis: ["☁️", "⛅"] },
  { icon: "Droplet", emojis: ["💧", "🌊"] },
  { icon: "Dog", emojis: ["🐶", "🐕", "🐉", "🐲"] },
  { icon: "Cat", emojis: ["🐱", "🐈"] },
];

/** Resolve a leading emoji to a folder icon id (preset lucide id or raw emoji). */
export function emojiToFolderIcon(emoji: string): string {
  for (const m of MAP) if (m.emojis.includes(emoji)) return m.icon;
  return emoji; // keep the emoji glyph as the icon
}

/** Convenience: from a raw folder name → { name (clean), icon } if it has a leading emoji. */
export function folderMetaFromName(name: string): { name: string; icon: string } | null {
  const e = leadingEmoji(name);
  if (!e) return null;
  return { name: stripLeadingEmoji(name) || name, icon: emojiToFolderIcon(e) };
}
