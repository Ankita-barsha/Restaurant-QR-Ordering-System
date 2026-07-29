/**
 * Customer navigation.
 *
 * Transparent over the hero and solid once scrolled — the bar should not
 * compete with the first impression, but must stay legible over a photograph
 * further down the page.
 */

import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { useCart } from "../context/cart";

/**
 * There is deliberately no "Track" link.
 *
 * Tracking is authorised by a per-order token the diner receives when they
 * order, so a nav item pointing at /track could only ever offer to recover a
 * previous order — a dead end for the many visitors who have not ordered yet.
 * The link a diner actually needs opens by itself the moment they place an
 * order, and the scan screen offers it to anyone returning mid-meal.
 */
const LINKS = [
  { to: "/menu", label: "Menu" },
  { to: "/reserve", label: "Reserve" },
  { to: "/welcome#featured", label: "Featured" },
  { to: "/welcome#gallery", label: "Gallery" },
  { to: "/welcome#about", label: "About" },
];

const Navbar = () => {
  const { itemCount, table } = useCart();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const overHero = pathname === "/welcome";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Close the mobile menu on navigation, or it covers the page you moved to.
   *
   * Adjusted during render rather than in an effect. An effect would paint the
   * new page with the menu still over it, then immediately re-render to hide
   * it — a visible flicker, and the cascading render the hooks lint warns
   * about. React re-runs this component before touching the DOM, so the menu
   * is simply never drawn open on the new route.
   */
  const [menuPath, setMenuPath] = useState(pathname);

  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  const solid = scrolled || !overHero;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        solid ? "border-b border-smoke bg-obsidian/85 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:gap-6 sm:px-6 sm:py-4">
        <Link to="/welcome" className="font-display truncate text-xl tracking-wide text-ivory sm:text-2xl">
          Bite me Bistro
        </Link>

        <div className="hidden items-center gap-9 md:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-[11px] uppercase tracking-[0.22em] transition-colors duration-500 ${
                  isActive ? "text-gold" : "text-ivory-dim hover:text-gold"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {table && (
            <span className="hidden rounded-full border border-gold/30 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-gold sm:inline">
              Table {table.tableNumber}
            </span>
          )}

          <Link
            to="/cart"
            aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            className="relative flex h-11 w-11 items-center justify-center text-ivory transition-colors duration-500 hover:text-gold"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
            </svg>

            {itemCount > 0 && (
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-medium text-obsidian">
                {itemCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center text-ivory transition-colors hover:text-gold md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              {menuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 7h18M3 12h18M3 17h18" />}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="animate-rise max-h-[70svh] overflow-y-auto border-t border-smoke bg-obsidian/95 px-4 py-4 backdrop-blur-xl sm:px-6 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex min-h-11 items-center text-[11px] uppercase tracking-[0.22em] text-ivory-dim hover:text-gold"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
