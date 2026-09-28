import { useEffect, useRef } from "react";
import { useMediaQuery, useReducedMotion } from "@/lib/hooks";

// le petit curseur rond du prototype, qui grossit sur les liens (souris seulement)
export function Cursor() {
  const fine = useMediaQuery("(pointer: fine)");
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = ref.current;
    if (!fine || reduced || !cursor) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let frame = 0;
    let visible = false;
    cursor.style.opacity = "0";
    const onMove = (event: PointerEvent) => {
      tx = event.clientX;
      ty = event.clientY;
      if (!visible) {
        visible = true;
        x = tx;
        y = ty;
        cursor.style.opacity = "";
      }
      const interactive = (event.target as Element | null)?.closest?.("a, button, [role='option'], label, .check");
      cursor.classList.toggle("big", Boolean(interactive));
    };
    const onLeave = () => {
      visible = false;
      cursor.style.opacity = "0";
    };
    const loop = () => {
      x += (tx - x) * 0.35;
      y += (ty - y) * 0.35;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [fine, reduced]);

  if (!fine || reduced) return null;
  return <div ref={ref} className="cursor" aria-hidden="true" />;
}
