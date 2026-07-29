import React from "react";

interface MonkDeveloperBrandProps {
  className?: string;
  variant?: "light" | "dark" | "compact" | "banner";
}

export const MonkDeveloperBrand: React.FC<MonkDeveloperBrandProps> = ({
  className = "",
  variant = "dark",
}) => {
  if (variant === "banner") {
    return (
      <div className={`mx-auto max-w-4xl rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-amber-500/15 to-orange-500/10 p-5 sm:p-6 text-center shadow-lg shadow-orange-500/5 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">
          Official Technology Partner
        </p>
        <h4 className="font-display mt-1 text-2xl font-black tracking-widest text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">
          MONK DEVELOPER
        </h4>
        <p className="mt-1 text-xs text-ivory-dim">
          Powering Modern Restaurant Management & Smart QR Ordering Systems
        </p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
        <span className="text-ivory-faint">Powered by</span>
        <span className="font-extrabold tracking-wide text-orange-500 hover:text-orange-400 transition-colors">
          MONK DEVELOPER
        </span>
      </span>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1 py-6 text-center ${className}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-ivory-faint">
        System Designed & Developed by
      </p>
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
        <span className="font-display text-sm font-bold tracking-widest text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]">
          MONK DEVELOPER
        </span>
      </div>
    </div>
  );
};
