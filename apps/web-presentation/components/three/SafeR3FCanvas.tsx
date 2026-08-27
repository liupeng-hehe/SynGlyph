"use client";

import { Canvas } from "@react-three/fiber";
import { Component, type ComponentProps, type ReactNode, useEffect, useState } from "react";

type CanvasProps = ComponentProps<typeof Canvas>;

type Props = CanvasProps & {
  fallback?: ReactNode;
};

type BoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type BoundaryState = {
  hasError: boolean;
};

function DefaultFallback() {
  return (
    <div className="flex h-full min-h-[18rem] w-full items-center justify-center rounded-2xl border border-stone-300/60 bg-stone-100/70 px-6 text-center text-sm text-stone-600">
      3D view is unavailable because this browser could not create a WebGL context.
    </div>
  );
}

function canCreateWebGLContext(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  try {
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

class WebGLErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[SafeR3FCanvas] WebGL canvas failed:", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function SafeR3FCanvas({ fallback, ...props }: Props) {
  const [webglReady, setWebglReady] = useState<boolean | null>(null);
  const fallbackNode = fallback ?? <DefaultFallback />;

  useEffect(() => {
    setWebglReady(canCreateWebGLContext());
  }, []);

  if (webglReady === null) {
    return <div className={props.className} style={props.style} />;
  }

  if (!webglReady) {
    return fallbackNode;
  }

  return (
    <WebGLErrorBoundary fallback={fallbackNode}>
      <Canvas {...props} />
    </WebGLErrorBoundary>
  );
}
