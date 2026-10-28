"use client";
import { useEffect } from "react";

/**
 * Anywhere text is cut off with an ellipsis, show the whole thing: hover on desktop, press-and-hold on touch.
 * Works for every `.truncate` / `.line-clamp-*` element in the app without wiring each one.
 */
export function RevealTruncated() {
  useEffect(() => {
    let tip: HTMLDivElement | null = null;
    let timer: number | null = null;
    const clipped = (el: Element | null): HTMLElement | null => {
      let e = el as HTMLElement | null;
      for (let i = 0; e && i < 4; i++, e = e.parentElement) {
        const cs = getComputedStyle(e);
        const clip = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none";
        if (clip && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) return e;
      }
      return null;
    };
    const show = (el: HTMLElement) => {
      hide();
      tip = document.createElement("div");
      tip.textContent = el.textContent ?? "";
      tip.setAttribute("role", "tooltip");
      tip.className = "fixed z-[100] max-w-[min(92vw,420px)] rounded-[10px] bg-ink text-white text-[12px] leading-snug px-3 py-2 shadow-lg pointer-events-none whitespace-pre-wrap break-words";
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      const h = tip.offsetHeight, w = tip.offsetWidth;
      let top = r.top - h - 8; if (top < 8) top = r.bottom + 8;
      let left = r.left; if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      tip.style.top = `${top}px`; tip.style.left = `${left}px`;
    };
    const hide = () => { tip?.remove(); tip = null; if (timer) { clearTimeout(timer); timer = null; } };
    const onOver = (e: MouseEvent) => { const el = clipped(e.target as Element); if (el) show(el); else hide(); };
    const onDown = (e: PointerEvent) => { if (e.pointerType !== "touch") return; const el = clipped(e.target as Element); if (!el) return; timer = window.setTimeout(() => show(el), 350); };
    const end = () => { if (timer) { clearTimeout(timer); timer = null; } if (tip) setTimeout(hide, 1800); };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("mouseover", onOver); document.removeEventListener("pointerdown", onDown); document.removeEventListener("pointerup", end); document.removeEventListener("pointercancel", end); document.removeEventListener("scroll", hide, true); hide(); };
  }, []);
  return null;
}
