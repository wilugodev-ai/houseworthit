'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function StickyHeader({ children }: { children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const header = element.current;
    if (!header) return;
    // The mobile menu can wrap, and text zoom/font loading can change its
    // height. Keep anchor navigation and focused controls below the real menu.
    const update = () => document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return <div className="sticky-header" ref={element}>{children}</div>;
}
