/**
 * Dedicated Admin & Manager Banking Settings Page (/admin/banking).
 *
 * Allows Restaurant Managers and Admins to configure:
 * - Registered Merchant Banking Name (shown to diners on GPay, PhonePe, Paytm checkout)
 * - Merchant UPI VPA ID (e.g. bitemebistro@upi, 9876543210@paytm)
 * - Restaurant Settlement Bank Account & IFSC details for cash reconciliation
 * - Real-world Razorpay / Paytm Merchant API Keys Integration (Key ID & Key Secret)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse, PublicSettings } from "../../types/api";
import { LuxeButton, LuxeError, LuxeSkeleton } from "../../components/luxe";

const AdminBanking = () => {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const updateSettings = useMutation({
    mutationFn: async (payload: {
      bankingName: string;
      merchantVpa: string;
      bankAccountNo: string;
      bankIfscCode: string;
      paymentGatewayProvider: string;
      razorpayKeyId: string;
      razorpayKeySecret: string;
      paytmMerchantId: string;
    }) =>
      unwrap(
        await api.patch<ApiResponse<PublicSettings>>("/admin/settings", payload)
      ),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    updateSettings.mutate({
      bankingName: String(fd.get("bankingName") ?? "").trim(),
      merchantVpa: String(fd.get("merchantVpa") ?? "").trim(),
      bankAccountNo: String(fd.get("bankAccountNo") ?? "").trim(),
      bankIfscCode: String(fd.get("bankIfscCode") ?? "").trim().toUpperCase(),
      paymentGatewayProvider: String(fd.get("paymentGatewayProvider") ?? "RAZORPAY").trim(),
      razorpayKeyId: String(fd.get("razorpayKeyId") ?? "").trim(),
      razorpayKeySecret: String(fd.get("razorpayKeySecret") ?? "").trim(),
      paytmMerchantId: String(fd.get("paytmMerchantId") ?? "").trim(),
    });
  };

  const data = settingsQuery.data;

  if (settingsQuery.isLoading) {
    return <LuxeSkeleton className="h-[400px] w-full max-w-3xl" />;
  }

  return (
    <div className="space-y-6 max-w-3xl animate-rise">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ivory">Banking & Payment Gateway Settings</h1>
        <p className="mt-1 text-xs text-ivory-dim">
          Configure registered merchant banking name, UPI VPA, and Razorpay / Paytm Merchant API Keys.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-4 text-xs font-semibold text-emerald-400 animate-fade">
          ✓ Banking & Gateway Settings updated! Merchant API keys are active.
        </div>
      )}

      {updateSettings.isError && (
        <LuxeError message={getErrorMessage(updateSettings.error)} />
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-smoke bg-charcoal p-6 sm:p-8">
        {/* Section 1: Merchant UPI & Payee Name */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gold flex items-center gap-2">
            <span>📱</span> UPI & Payee Identity
          </h2>
          <p className="text-xs text-ivory-faint leading-relaxed">
            This name and UPI ID will be transmitted during deep-linking to Google Pay, PhonePe, Paytm so diners see your restaurant name.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ivory-dim">
                Registered Merchant Banking Name *
              </label>
              <input
                type="text"
                name="bankingName"
                required
                defaultValue={data?.bankingName ?? data?.name ?? "Bite me Bistro"}
                placeholder="e.g. Bite me Bistro / Restaurant Legal Name"
                className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none"
              />
              <p className="text-[10px] text-ivory-faint">
                Appears as payee name in GPay, PhonePe & bank receipts.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ivory-dim">
                Merchant UPI VPA ID *
              </label>
              <input
                type="text"
                name="merchantVpa"
                required
                defaultValue={data?.merchantVpa ?? "bitemebistro@upi"}
                placeholder="e.g. bitemebistro@upi or 9876543210@paytm"
                className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono"
              />
              <p className="text-[10px] text-ivory-faint">
                Your active business UPI VPA ID.
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-smoke" />

        {/* Section 2: Real Razorpay / Paytm Merchant Gateway Keys Integration */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gold flex items-center gap-2">
            <span>💳</span> Razorpay & Paytm Merchant API Integration
          </h2>
          <p className="text-xs text-ivory-faint leading-relaxed">
            Enter your Razorpay / Paytm Merchant Key ID and Secret to collect direct card & netbanking payments into your bank account.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ivory-dim">Primary Gateway Provider</label>
            <select
              name="paymentGatewayProvider"
              defaultValue={data?.paymentGatewayProvider ?? "RAZORPAY"}
              className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory focus:border-gold focus:outline-none"
            >
              <option value="RAZORPAY">Razorpay Merchant Gateway (Recommended)</option>
              <option value="PAYTM">Paytm Merchant API Gateway</option>
              <option value="UPI_DIRECT">Direct UPI & Cash Only</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ivory-dim">
                Razorpay Key ID
              </label>
              <input
                type="text"
                name="razorpayKeyId"
                defaultValue={data?.razorpayKeyId ?? ""}
                placeholder="e.g. rzp_live_xxxxxxxxxxxx / rzp_test_..."
                className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono"
              />
              <p className="text-[10px] text-ivory-faint">
                Get from Razorpay Dashboard ➔ Settings ➔ API Keys
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ivory-dim">
                Razorpay Key Secret
              </label>
              <input
                type="password"
                name="razorpayKeySecret"
                defaultValue={data?.razorpayKeySecret ?? ""}
                placeholder="Key Secret"
                className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ivory-dim">
              Paytm Merchant ID (MID)
            </label>
            <input
              type="text"
              name="paytmMerchantId"
              defaultValue={data?.paytmMerchantId ?? ""}
              placeholder="e.g. BITE_ME_BISTRO_MID_12345"
              className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="h-px bg-smoke" />

        {/* Section 3: Bank Settlement Details */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-gold flex items-center gap-2">
            <span>🏦</span> Settlement Bank Account Details
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ivory-dim">
                Bank Account Number
              </label>
              <input
                type="text"
                name="bankAccountNo"
                defaultValue={data?.bankAccountNo ?? ""}
                placeholder="e.g. 98765432101234"
                className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ivory-dim">
                Bank IFSC Code
              </label>
              <input
                type="text"
                name="bankIfscCode"
                defaultValue={data?.bankIfscCode ?? ""}
                placeholder="e.g. HDFC0001234"
                className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono uppercase"
              />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <LuxeButton
            type="submit"
            className="w-full sm:w-auto px-8 py-3 font-bold"
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? "Saving Settings..." : "Save Banking & Gateway Keys"}
          </LuxeButton>
        </div>
      </form>
    </div>
  );
};

export default AdminBanking;
