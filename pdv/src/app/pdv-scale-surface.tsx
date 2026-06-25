"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function PdvScaleSurface({ centered = false, children }: { centered?: boolean; children: ReactNode }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    let animationFrameId: number | null = null;
    const initialSurface = surfaceRef.current;

    const updateFrameHeight = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;

        if (!surfaceRef.current) {
          return;
        }

        const surfaceRect = surfaceRef.current.getBoundingClientRect();
        const nextHeight = Math.max(window.innerHeight, Math.ceil(surfaceRect.height));

        setFrameHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
      });
    };

    updateFrameHeight();

    if (!initialSurface) {
      return () => {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
        }
      };
    }

    const resizeObserver = new ResizeObserver(updateFrameHeight);
    resizeObserver.observe(initialSurface);
    window.addEventListener("resize", updateFrameHeight);
    window.addEventListener("caixaagil:pdv-app-scale-changed", updateFrameHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateFrameHeight);
      window.removeEventListener("caixaagil:pdv-app-scale-changed", updateFrameHeight);

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div className="pdv-app-scale-frame" style={frameHeight ? { minHeight: frameHeight } : undefined}>
      <div
        className={centered ? "pdv-app-scale-surface pdv-app-scale-surface-center" : "pdv-app-scale-surface"}
        ref={surfaceRef}
      >
        {children}
      </div>
    </div>
  );
}
