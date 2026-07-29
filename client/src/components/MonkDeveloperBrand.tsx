import React from "react";

interface MonkDeveloperBrandProps {
  className?: string;
  variant?: "light" | "dark" | "compact";
}

export const MonkDeveloperBrand: React.FC<MonkDeveloperBrandProps> = ({
  className = "",
  variant = "dark",
}) => {
  if (variant === "compact") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
        <span className="text-slate-400">Powered by</span>
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
