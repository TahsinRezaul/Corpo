"use client";

import { usePathname } from "next/navigation";

const NO_PAD = ["/login"];

export default function ConditionalPadding({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const noPad = NO_PAD.some(p => path === p || path.startsWith(p + "/"));
  return <div style={noPad ? {} : { paddingTop: "52px" }}>{children}</div>;
}
