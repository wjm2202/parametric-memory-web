"use client";

import dynamic from "next/dynamic";

// ssr: false is only valid inside a Client Component — this wrapper provides that boundary
const HeroScene = dynamic(() => import("./HeroScene").then((m) => m.HeroScene), {
  ssr: false,
  loading: () => null,
});

export function HeroSceneWrapper() {
  return <HeroScene />;
}
