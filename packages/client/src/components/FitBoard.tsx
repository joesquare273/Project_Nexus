import { useEffect, useRef, type ReactNode } from 'react';
/** Shrink a crowded battlefield to its available quadrant without hiding cards. */
export function FitBoard({ enabled, children }: { enabled: boolean; children: ReactNode }) {
 const box = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
 useEffect(() => {
  if (!enabled || !box.current || !content.current) return;
  const outer=box.current, inner=content.current;
  const fit=()=>{
   const scale=Math.min(1, outer.clientWidth / Math.max(1,inner.scrollWidth), outer.clientHeight / Math.max(1,inner.scrollHeight));
   inner.style.transform='scale(' + Math.max(0.01,scale) + ')';
  };
  const observer=new ResizeObserver(fit); observer.observe(outer); observer.observe(inner); fit();
  return ()=>observer.disconnect();
 },[enabled]);
 return enabled ? <div className="fit-board" ref={box}><div className="fit-board-content" ref={content}>{children}</div></div> : <>{children}</>;
}
