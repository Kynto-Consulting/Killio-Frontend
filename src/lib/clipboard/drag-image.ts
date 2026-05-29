// Stacked "deck of cards" drag image for multi-brick ghost drag. Renders an
// offscreen element and hands it to dataTransfer.setDragImage. Caller need not
// clean up — the node is removed on the next tick.

export function setStackedDragImage(dt: DataTransfer, count: number, label?: string): void {
  if (typeof document === "undefined" || count <= 0) return;
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;top:-1000px;left:-1000px;pointer-events:none;font:500 12px ui-sans-serif,system-ui;";
  const n = Math.min(count, 3);
  for (let i = n - 1; i >= 0; i -= 1) {
    const card = document.createElement("div");
    card.style.cssText = `position:absolute;top:${i * 4}px;left:${i * 4}px;width:160px;height:40px;border-radius:8px;border:1px solid rgba(34,211,238,.5);background:rgba(15,23,42,.95);box-shadow:0 6px 18px rgba(0,0,0,.45);`;
    wrap.appendChild(card);
  }
  const front = document.createElement("div");
  front.style.cssText = "position:absolute;top:0;left:0;width:160px;height:40px;border-radius:8px;border:1px solid rgba(34,211,238,.7);background:rgba(2,6,23,.98);color:#e2e8f0;display:flex;align-items:center;justify-content:center;gap:6px;";
  front.textContent = count > 1 ? `${count} bricks${label ? ` · ${label}` : ""}` : (label || "1 brick");
  wrap.appendChild(front);
  document.body.appendChild(wrap);
  try { dt.setDragImage(wrap, 80, 20); } catch { /* unsupported */ }
  setTimeout(() => { try { document.body.removeChild(wrap); } catch { /* already gone */ } }, 0);
}
