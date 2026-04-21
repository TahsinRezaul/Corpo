"use client";

import { usePathname } from "next/navigation";
import NavBar from "./NavBar";

const NO_NAV = ["/login", "/admin"];

export default function ConditionalNavBar() {
  const path = usePathname();
  if (NO_NAV.some(p => path === p || path.startsWith(p + "/"))) return null;
  return <NavBar />;
}
