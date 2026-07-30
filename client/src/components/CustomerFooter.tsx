/**
 * Global Customer Footer Component
 * Included across all diner-facing screens (/menu, /reserve, /cart, /track, /scan)
 * Features restaurant information and subtle MONK DEVELOPER orange branding.
 */

import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../lib/api";
import type { ApiResponse, PublicSettings } from "../types/api";
import { MonkDeveloperBrand } from "./MonkDeveloperBrand";

export const CustomerFooter: React.FC = () => {
  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const restaurantName = settingsQuery.data?.name ?? "Bite me Bistro";

  return (
    <footer className="border-t border-smoke bg-obsidian text-ivory">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-14 md:grid-cols-3">
        <div>
          <h3 className="font-display text-2xl text-ivory">{restaurantName}</h3>
          <div className="rule-fade mt-3 h-px w-20" />
          <p className="mt-4 text-xs leading-relaxed text-ivory-faint">
            {settingsQuery.data?.address || "Fine dining & table-side QR ordering"}
          </p>
        </div>

        <div>
          <p className="eyebrow text-xs">Hours</p>
          <dl className="mt-4 space-y-2 text-xs text-ivory-dim">
            <div className="flex justify-between gap-4">
              <dt>Tuesday – Sunday</dt>
              <dd className="text-ivory">
                {settingsQuery.data?.openingTime ?? "12:00"} – {settingsQuery.data?.closingTime ?? "23:00"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Monday</dt>
              <dd className="text-ivory-faint">Closed</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="eyebrow text-xs">Quick Links</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ivory-dim">
            <Link to="/menu" className="hover:text-gold transition-colors">Menu</Link>
            <Link to="/reserve" className="hover:text-gold transition-colors">Reserve Table</Link>
            <Link to="/track" className="hover:text-gold transition-colors">My Orders</Link>
            <Link to="/welcome" className="hover:text-gold transition-colors">About Us</Link>
            <Link to="/privacy" className="hover:text-gold transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </div>

      <div className="border-t border-smoke/70 px-4 py-6 text-center flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto gap-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ivory-faint">
          © {new Date().getFullYear()} {restaurantName}. All rights reserved.
        </p>
        <MonkDeveloperBrand variant="compact" />
      </div>
    </footer>
  );
};

export default CustomerFooter;
