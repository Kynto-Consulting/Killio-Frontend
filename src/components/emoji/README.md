# Emoji system

Images: Twemoji (`@twemoji/api` 17.0.3, pinned CDN URL in `src/lib/emoji/twemoji-url.ts`, cached by the service worker in
`twemoji-cache-v1`). Data and search: `@emoji-mart/data` (loaded lazily, ~430 KB). Credits: `/credits`.

## Components (`@/components/emoji`)

- `<Emoji value="😀" size={20} />` renders one emoji as a Twemoji image; falls back to the native glyph if the image fails.
- `<EmojiText text={str} />` renders a string turning emojis into `<Emoji/>`. Code spans, markdown links, mention tokens
  and URLs are left as written. Display only: stored text is never modified. `RichText` already uses it.
- `<EmojiPicker onSelect={(value, selection) => ...} onClose />` the picker itself (search, categories, skin tones,
  recents, preview). `<EmojiPickerPopover anchor={element} onClose onSelect />` floats it next to an element (bottom
  sheet under 640px). `<EmojiPickerButton onSelect />` is a ready-made trigger button.
- `selection` is `{ type: "unicode", emoji, shortcode, name }` or `{ type: "custom", custom, token }`.

Styling uses only theme tokens (`card`, `border`, `muted`, `primary`, `ring`), so light/dark mode and the tenant's brand
colours apply with no extra setup. Texts live in the `emoji` i18n namespace (en/es).

## Pure helpers (`@/lib/emoji`, tested with `npm run test:emoji`)

`dataset.ts` (build/load), `search.ts`, `skin.ts`, `usage.ts` (recents, localStorage key `emoji_reaction_usage`),
`shortcodes.ts` (`:name:` replacement and caret query), `segments.ts` (text -> text/emoji/custom segments).

## Custom emojis of a space ("Servidor" section)

There is no backend for them yet; the UI is ready. Provide them once they exist:

```tsx
<EmojiProvider customEmojis={[{ id: "1", name: "party_parrot", url: "https://.../parrot.gif" }]}>
  ...app or room subtree...
</EmojiProvider>
```

or pass `customEmojis` straight to the picker. `name` must be 2-32 letters, digits or underscores; in text they are
written `:name:` and `<EmojiText/>` renders them as images. Wire the real source (API fetch) where the provider is mounted.

## Known limits

- Emoji names and keywords are English; `es-keywords.ts` adds Spanish terms for ~110 common emojis only.
- Emojis newer than Twemoji 17 fall back to the native glyph.

## Composer autocomplete

`EmojiSuggestMenu` + `lib/emoji/suggest.ts` power the Discord-style `:sm` menu in `RoomInput` (Unicode via the dataset plus the team custom emojis). `ReferenceTokenInput` exposes the caret through `handleRef` (`getCaret`, `replaceRange`, `insertAtCaret`), which is also what the composer emoji button uses.
