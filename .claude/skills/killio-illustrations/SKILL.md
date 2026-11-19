---
name: killio-illustrations
description: Create or edit Killio's line-art illustrations (onboarding, empty states, help) with the internal SVG library in src/components/onboarding/onboarding-art.tsx. Use when asked for a new scene, character, pose, outfit or illustration in "the Killio / Notion-like / corporate memphis" style.
---

# Killio illustrations

Library: `src/components/onboarding/onboarding-art.tsx` (pure SVG + React, no assets). Scenes are composed in `OnboardingArt`
(viewBox 320×240). Original drawings in an editorial, hand-drawn spirit; never trace or copy third-party illustrations (Notion's
included): learn the style, draw our own.

## Style rules (agreed with the product owner)
- Thick ink outline (3–3.4), tube limbs (`Tube`), minimal faces (dot or arc eyes, brows, small nose, mouth by mood), solid dark hair.
- Faces are NOT circles: use `face="oval" | "square" | "heart"` (jaw + chin).
- **Everyone faces the camera** in this set: bodies, faces and feet front (`feet` defaults to `"front"`). Only use the
  three-quarter or side shoes (`Facing`: 8 directions) in a set that is explicitly drawn in profile.
- Movement: give every person a pose — `armL/armR` (down, wave, cheer, point, reach, hold, carry, hip, think), `legs`
  (stand, stride, step, wide), `lean` and `tilt` of a few degrees, and a `mood` (happy, calm, wow, think).
- Clothes vary per person: `outfit` (tee, hoodie, jacket, blazer, cardigan, polo, scarf, stripes, turtle, vest, overalls, dress),
  `sleeves` short/long, `shorts`, accessories `glasses`, `headphones`, `bag`, coloured `shoes`.
- Colour: Killio lime is the accent (`LIME`), soft accents from `SOFT` (blue, pink, sun, red, violet), three skin tones (`SKINS`).
  Never hard-code hex in a scene: use the variables so the palettes work.
- Light: white paper, dark ink, lime blob. Dark: SAME dark ink and light paper on a lime tile (`--ob-tile`) — never white
  strokes on black (they read as chalk). Palettes live in `PALETTE_CSS`.
- Depth: ground shadow (built in), something in the foreground (`Plant`), `Motion` marks for gestures, `Sparkle`/`Squiggle` doodles.
- A person points/reaches to local −x; use `flip` so they point at the object of the scene.

## Adding a scene
1. Add the id to `ArtScene` and a block in `OnboardingArt`. Ground line y≈228; a person at scale 1 stands at y≈128.
2. Keep props inside x 16–304 (the tile has rounded corners) and leave the person's silhouette readable (no prop over the face).
3. Preview without the app: render with `react-dom/server` from a throwaway `.preview-render.tsx` at the project root
   (`npx tsx --tsconfig <tmp tsconfig with "jsx":"react-jsx">`), open the HTML in the browser pane, check light AND dark
   (wrap in an element with class `dark`), zoom into hands, feet and faces, then delete the throwaway files.
4. `npx tsc --noEmit -p tsconfig.json` must stay clean for the file.

## Checklist before showing it
- Feet: two distinct shoes (front foot drawn last, with its `part="halo"`), legs enter the shoes cleanly.
- Short sleeves: the shoulder is coloured (no skin cap sticking out).
- Nothing cropped at the tile edge; dark variant reviewed.
