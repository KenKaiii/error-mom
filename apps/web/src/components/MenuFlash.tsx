"use client";

import { useEffect } from "react";

const FLASHABLE = ".status-tab, .button";

/**
 * Classic Mac menu-item flash: when a button or tab is activated it
 * blinks inverted three times before the action lands. Mounted once in
 * the root layout; delegates clicks so every control gets the flash
 * without per-component wiring. Renders nothing and never blocks the UI.
 */
export function MenuFlash() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(FLASHABLE);
      if (!control || control.matches(":disabled")) return;
      control.classList.remove("menu-flash");
      void control.offsetWidth; // Restart the animation on rapid re-clicks.
      control.classList.add("menu-flash");
    }

    function onAnimationEnd(event: AnimationEvent) {
      if (event.animationName !== "menu-flash") return;
      if (event.target instanceof Element) event.target.classList.remove("menu-flash");
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("animationend", onAnimationEnd, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("animationend", onAnimationEnd, true);
    };
  }, []);

  return null;
}
