"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setShown(true), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, shown } = useReveal();
  return (
    <div ref={ref} className={`muv-reveal${className ? ` ${className}` : ""}`} data-shown={shown} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}
