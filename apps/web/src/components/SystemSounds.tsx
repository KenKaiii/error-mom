"use client";

import { useEffect } from "react";
import { playBeep, playClick, playOpen } from "@/lib/sounds";

const CLICKABLE = "button, a, select, input[type='checkbox'], input[type='radio'], [role='button']";

/**
 * Global retro sound layer. Mounted once in the root layout; delegates
 * pointer events so every button, link, and select clicks like an old
 * Mac, dialogs chirp on open, and alerts get the classic error beep.
 * Renders nothing and never blocks the UI.
 */
export function SystemSounds() {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(CLICKABLE)) playClick();
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const node = mutation.target;
          if (node instanceof HTMLDialogElement && node.open) playOpen();
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[role='alert']") || node.querySelector("[role='alert']")) {
            playBeep();
            break;
          }
        }
      }
    });

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      observer.disconnect();
    };
  }, []);

  return null;
}
