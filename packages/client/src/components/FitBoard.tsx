import { useEffect, useRef, type ReactNode } from 'react';
/** Reflow across the full seat width before reducing card scale to fit its height. */
export function FitBoard({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !box.current || !content.current) return;
    const outer = box.current, inner = content.current;
    let frame = 0;
    const fit = () => {
      const width = outer.clientWidth - 8, height = outer.clientHeight - 8;
      if (width <= 0 || height <= 0) return;
      // A smaller scale gives layout more CSS width, so cards wrap into fewer rows.
      const fits = (scale: number) => {
        inner.style.width = width / scale + 'px';
        return inner.scrollHeight * scale <= height && inner.scrollWidth * scale <= width + 1;
      };
      let low = 0.01, high = 1;
      if (fits(1)) low = 1;
      else for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid; else high = mid;
      }
      inner.style.width = width / low + 'px';
      inner.style.transform = 'scale(' + low + ')';
      inner.style.left = '4px';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(schedule);
    observer.observe(outer); observer.observe(inner); fit();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [enabled]);
  return enabled ? <div className="fit-board" ref={box}><div className="fit-board-content" ref={content}>{children}</div></div> : <>{children}</>;
}
