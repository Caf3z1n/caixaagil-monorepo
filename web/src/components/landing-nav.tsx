"use client";

import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

import { smoothScrollToSection } from "@/lib/smooth-scroll";

const navItems = [
  { id: "inicio", label: "Início" },
  { id: "produto", label: "Produto" },
  { id: "planos", label: "Planos" },
  { id: "faq", label: "FAQ" }
];

export function LandingNav() {
  const [activeId, setActiveId] = useState(navItems[0].id);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    window.history.pushState(null, "", `#${id}`);
    smoothScrollToSection(id);
  }

  useEffect(() => {
    function updateActiveSection() {
      const marker = window.scrollY + 120;
      let currentId = navItems[0].id;

      for (const item of navItems) {
        const section = document.getElementById(item.id);

        if (section && section.offsetTop <= marker) {
          currentId = item.id;
        }
      }

      const reachedBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8;

      setActiveId(reachedBottom ? navItems[navItems.length - 1].id : currentId);
    }

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  return (
    <nav className="landing-nav" aria-label="Navegação">
      {navItems.map((item) => {
        const active = activeId === item.id;

        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(event) => handleNavClick(event, item.id)}
            aria-current={active ? "page" : undefined}
            className={active ? "landing-nav-link landing-nav-link-active" : "landing-nav-link"}
          >
            {item.label}
            <span aria-hidden="true" />
          </a>
        );
      })}
    </nav>
  );
}
