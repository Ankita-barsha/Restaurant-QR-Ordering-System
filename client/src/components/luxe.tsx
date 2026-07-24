/**
 * Luxury UI primitives.
 *
 * One set of building blocks shared by every screen, so the dining room, the
 * menu and the checkout all feel like the same restaurant.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals a section as it scrolls into view.
 *
 * IntersectionObserver rather than a scroll listener: the browser does the
 * work off the main thread, so a long page stays smooth on a phone.
 * `once` is the default because re-animating on every pass is distracting.
 */
export const useReveal = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      // Fires slightly before the element reaches the viewport, so the motion
      // has finished by the time it is properly in view.
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return { ref, shown };
};

export const Reveal = ({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => {
  const { ref, shown } = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
};

/** Small caps label above a heading. */
export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <span className="eyebrow block">{children}</span>
);

/** Centred section heading with an ornamental rule beneath. */
export const SectionHeading = ({
  eyebrow,
  title,
  lede,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: "center" | "left";
}) => (
  <div className={align === "center" ? "text-center" : ""}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}

    <h2 className="mt-3 text-4xl leading-[1.08] text-ivory sm:text-5xl md:text-6xl">
      {title}
    </h2>

    <div
      className={`rule-fade mt-6 h-px w-40 ${align === "center" ? "mx-auto" : ""}`}
    />

    {lede && (
      <p
        className={`mt-6 max-w-2xl text-[15px] leading-relaxed text-ivory-dim ${
          align === "center" ? "mx-auto" : ""
        }`}
      >
        {lede}
      </p>
    )}
  </div>
);

/**
 * Primary action.
 *
 * The gold fill is reserved for the single most important action on a screen.
 * A page with three gold buttons has no primary action at all.
 */
export const LuxeButton = ({
  children,
  onClick,
  href,
  type = "button",
  variant = "gold",
  disabled,
  className = "",
  form,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  variant?: "gold" | "outline" | "ghost";
  disabled?: boolean;
  className?: string;
  form?: string;
}) => {
  const base =
    "group relative inline-flex items-center justify-center gap-2.5 overflow-hidden px-8 py-3.5 text-[11px] font-normal uppercase tracking-[0.2em] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:cursor-not-allowed disabled:opacity-45";

  const variants = {
    gold: "bg-gold text-obsidian hover:bg-gold-light hover:shadow-[0_18px_40px_-18px_rgba(201,169,97,0.55)]",
    outline:
      "border border-gold/40 text-gold hover:border-gold hover:bg-gold/10",
    ghost: "text-ivory-dim hover:text-gold",
  };

  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} form={form} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
};

/** Loading placeholder that mirrors the shape of what is coming. */
export const LuxeSkeleton = ({ className = "" }: { className?: string }) => (
  <div className={`skeleton rounded-luxe ${className}`} />
);

/**
 * Loading state.
 *
 * A slowly rotating ring rather than a spinner: at this pace it reads as the
 * kitchen taking its time, not as the app struggling.
 */
export const LuxeLoader = ({ label = "Preparing" }: { label?: string }) => (
  <div className="flex flex-col items-center justify-center gap-5 py-24">
    <div className="relative h-12 w-12">
      <div className="absolute inset-0 rounded-full border border-smoke" />
      <div className="absolute inset-0 animate-spin rounded-full border border-transparent border-t-gold [animation-duration:1.6s]" />
    </div>
    <span className="eyebrow">{label}</span>
  </div>
);

/** Empty state — never a bare "no results". */
export const LuxeEmpty = ({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/25">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gold">
        <path d="M3 11h18M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M4 11v2a8 8 0 0 0 16 0v-2" strokeLinecap="round" />
      </svg>
    </div>

    <h3 className="text-2xl text-ivory">{title}</h3>
    {hint && <p className="max-w-sm text-sm leading-relaxed text-ivory-faint">{hint}</p>}
    {action}
  </div>
);

/** Error state, styled to match rather than a red browser-default box. */
export const LuxeError = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div className="glass rounded-luxe flex flex-col items-start gap-3 p-6">
    <span className="eyebrow text-ember">Something went wrong</span>
    <p className="text-sm text-ivory-dim">{message}</p>
    {onRetry && (
      <LuxeButton variant="outline" onClick={onRetry} className="mt-1">
        Try again
      </LuxeButton>
    )}
  </div>
);

/** Veg / non-veg marker, as used on Indian menus. */
export const DietMark = ({ vegetarian }: { vegetarian: boolean }) => (
  <span
    aria-label={vegetarian ? "Vegetarian" : "Non-vegetarian"}
    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
      vegetarian ? "border-emerald-500/70" : "border-ember/80"
    }`}
  >
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        vegetarian ? "bg-emerald-500" : "bg-ember"
      }`}
    />
  </span>
);

/** Gold star rating. */
export const Stars = ({ rating = 5 }: { rating?: number }) => (
  <div className="flex gap-1" aria-label={`${rating} out of 5`}>
    {Array.from({ length: 5 }, (_, index) => (
      <svg
        key={index}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill={index < rating ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-gold"
      >
        <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ))}
  </div>
);
