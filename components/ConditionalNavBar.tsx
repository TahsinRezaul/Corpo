"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import NavBar from "./NavBar";
import LeftSidebar from "./LeftSidebar";
import TopBar from "./TopBar";
import { getSettings, type AppSettings } from "@/lib/storage";

const NO_NAV = ["/login"];

type NavStyle = AppSettings["navStyle"];

export default function ConditionalNavBar() {
  const path = usePathname();
  const [navStyle, setNavStyle] = useState<NavStyle>("list");

  useEffect(() => {
    setNavStyle(getSettings().navStyle ?? "list");
    function onStyleChange(e: Event) {
      setNavStyle((e as CustomEvent<NavStyle>).detail ?? getSettings().navStyle ?? "list");
    }
    window.addEventListener("corpo-nav-style-changed", onStyleChange);
    return () => window.removeEventListener("corpo-nav-style-changed", onStyleChange);
  }, []);

  if (NO_NAV.some((p) => path === p || path.startsWith(p + "/"))) return null;
  if (navStyle === "fiori")   return <NavBar />;
  if (navStyle === "sidebar") return <><TopBar /><LeftSidebar /></>;
  return <Sidebar />;
}
