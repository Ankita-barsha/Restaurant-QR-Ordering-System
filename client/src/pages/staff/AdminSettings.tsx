/**
 * Restaurant settings.
 *
 * Tax and service charge feed directly into every order total, so they are
 * grouped and labelled to make that consequence obvious before saving.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBox, Spinner } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse } from "../../types/api";

import ImagePicker from "../../components/ImagePicker";
import { config } from "../../config/env";
import { imageUrl } from "../../lib/format";

interface Settings {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  currency: string;
  taxPercent: string;
  serviceChargePercent: string;
  isAcceptingOrders: boolean;
  openingTime: string | null;
  closingTime: string | null;
  /** High-value order controls. A threshold of "0" switches them all off. */
  highValueThreshold: string;
  advancePaymentPercent: string;
  approvalRequired: boolean;
  advancePaymentRequired: boolean;
  allowCashAdvance: boolean;
  allowOnlineAdvance: boolean;
  advancePaymentMessage: string | null;
}

/**
 * The toggles on this screen.
 *
 * Listed as data because an unchecked HTML checkbox submits NOTHING, so every
 * one of them has to be normalised to an explicit "false" before the request
 * goes out — see handleSubmit. Missing a name here means that toggle can be
 * switched on but never off, which is the kind of bug nobody notices until a
 * restaurant cannot turn the feature back off.
 */
const TOGGLES = [
  "isAcceptingOrders",
  "approvalRequired",
  "advancePaymentRequired",
  "allowCashAdvance",
  "allowOnlineAdvance",
] as const;

const Toggle = ({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) => (
  <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
    <input
      type="checkbox"
      name={name}
      value="true"
      defaultChecked={defaultChecked}
      className="mt-0.5"
    />
    <span className="text-sm">
      <span className="font-medium text-white-800">{label}</span>
      <span className="block text-xs text-white-500">{hint}</span>
    </span>
  </label>
);

const Field = ({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
  hint?: string;
}) => (
  <label className="block text-sm">
    <span className="font-medium text-white-700">{label}</span>
    <input
      name={name}
      type={type}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
    />
    {hint && <span className="mt-0.5 block text-xs text-white-400">{hint}</span>}
  </label>
);

const AdminSettings = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => unwrap(await api.get<ApiResponse<Settings>>("/admin/settings")),
  });

  const updateSettings = useMutation({
    mutationFn: async (payload: FormData | Record<string, unknown>) =>
      api.patch("/admin/settings", payload),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (settingsQuery.isLoading) return <Spinner label="Loading settings" />;

  if (settingsQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(settingsQuery.error)}
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  const settings = settingsQuery.data;
  if (!settings) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    if (logoFile) {
      form.append("logo", logoFile);
    }

    // An unchecked checkbox submits nothing at all, so "absent" has to be
    // turned into an explicit "false" or the server reads it as "unchanged"
    // and the toggle can never be switched off.
    for (const name of TOGGLES) {
      form.set(name, form.get(name) === "true" ? "true" : "false");
    }

    updateSettings.mutate(form);
  };

  const logoSrc = settings.logoUrl ? imageUrl(settings.logoUrl, config.apiUrl) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white-900">Restaurant settings</h1>

      {updateSettings.isError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(updateSettings.error)} />
        </div>
      )}

      {saved && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
          Settings saved successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
        {/* Brand Logo & Identity Card */}
        <Card>
          <h2 className="font-semibold text-white-900 flex items-center gap-2">
            <span>🎨</span> Brand Identity & Logo
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Customize your restaurant logo. It will automatically appear on invoices, receipts, QR codes, headers, and public pages.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 items-start">
            <div>
              <label className="block text-sm font-medium text-white-700 mb-2">Upload Restaurant Logo</label>
              <ImagePicker
                currentUrl={logoSrc}
                onChange={setLogoFile}
                label="Restaurant Logo"
              />
            </div>
            <div className="space-y-3">
              <Field
                label="Or Custom Logo Image URL"
                name="logoUrl"
                defaultValue={settings.logoUrl}
                placeholder="/assets/image/logo.png or https://..."
                hint="Direct URL or static asset path"
              />

              {logoSrc && (
                <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Current Active Logo Preview:</p>
                  <div className="flex items-center gap-3">
                    <img
                      src={logoSrc}
                      alt={settings.name}
                      className="h-12 w-12 object-contain rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
                    />
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{settings.name}</p>
                      <p className="text-xs text-slate-500">{settings.tagline || "Fine Dining & Hospitality"}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white-900">General Information</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Restaurant name" name="name" defaultValue={settings.name} />
            <Field label="Tagline" name="tagline" defaultValue={settings.tagline} />
            <Field label="Email" name="email" type="email" defaultValue={settings.email} />
            <Field label="Phone" name="phone" defaultValue={settings.phone} />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white-900">Address</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Address" name="addressLine" defaultValue={settings.addressLine} />
            <Field label="City" name="city" defaultValue={settings.city} />
            <Field label="State" name="state" defaultValue={settings.state} />
            <Field label="Postal code" name="postalCode" defaultValue={settings.postalCode} />
            <Field label="Country" name="country" defaultValue={settings.country} />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white-900">Charges</h2>
          <p className="mt-1 text-xs text-white-500">
            These apply to every new order total. Existing orders keep the rates
            they were placed under.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field
              label="Currency"
              name="currency"
              defaultValue={settings.currency}
              hint="3-letter ISO code, e.g. INR"
            />
            <Field
              label="Tax %"
              name="taxPercent"
              defaultValue={settings.taxPercent}
              hint="Max 2 decimal places"
            />
            <Field
              label="Service charge %"
              name="serviceChargePercent"
              defaultValue={settings.serviceChargePercent}
            />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-white-900 flex items-center gap-2">
            <span>🛡️</span> High value orders
          </h2>
          <p className="mt-1 text-xs text-white-500">
            Advance payments trigger ONLY for orders exceeding <strong>₹3,000</strong>.
            Base advance starts at <strong>20%</strong> for orders &gt; ₹3,000, and automatically increases by <strong>+10%</strong> for every additional ₹1,000 above ₹3,000 (capped at 100%). Orders ≤ ₹3,000 require <strong>0% advance</strong>.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="High value threshold (₹)"
              name="highValueThreshold"
              defaultValue={settings.highValueThreshold}
              placeholder="3000"
              hint="Minimum order total required before advance rules apply (Default: ₹3,000)."
            />
            <Field
              label="Base advance payment %"
              name="advancePaymentPercent"
              defaultValue={settings.advancePaymentPercent}
              placeholder="20"
              hint="Base advance share for orders over ₹3,000 (+10% per extra ₹1,000)."
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Toggle
              name="approvalRequired"
              label="Require staff approval"
              hint="A waiter checks the table before the kitchen is told. Costs nothing."
              defaultChecked={settings.approvalRequired}
            />
            <Toggle
              name="advancePaymentRequired"
              label="Require advance payment"
              hint="The kitchen waits until the advance is collected."
              defaultChecked={settings.advancePaymentRequired}
            />
            <Toggle
              name="allowCashAdvance"
              label="Accept cash advances"
              hint="A waiter can take the advance at the table and release the order."
              defaultChecked={settings.allowCashAdvance}
            />
            <Toggle
              name="allowOnlineAdvance"
              label="Accept online advances"
              hint="The guest pays the advance from their own phone."
              defaultChecked={settings.allowOnlineAdvance}
            />
          </div>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-white-700">
              Message shown to the guest
            </span>
            <textarea
              name="advancePaymentMessage"
              rows={4}
              defaultValue={settings.advancePaymentMessage ?? ""}
              placeholder="Leave blank to use the built-in wording."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
            <span className="mt-0.5 block text-xs text-white-400">
              Keep it warm and matter-of-fact. Never mention fraud, fake orders
              or bad experiences — the guest reading this is spending a lot of
              money with you.
            </span>
          </label>

          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-white-500">
            A held order is <strong>not sent to the kitchen</strong> and is not
            shown on the Kitchen Display — nothing is cooked, so nothing is lost
            if the party leaves. The guest sees a dialog explaining why, and the
            floor is alerted immediately.
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-white-900">Service hours</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="Opening time"
              name="openingTime"
              defaultValue={settings.openingTime}
              placeholder="10:00"
              hint="24-hour HH:mm"
            />
            <Field
              label="Closing time"
              name="closingTime"
              defaultValue={settings.closingTime}
              placeholder="23:30"
              hint="24-hour HH:mm"
            />
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <input
              type="checkbox"
              name="isAcceptingOrders"
              value="true"
              defaultChecked={settings.isAcceptingOrders}
            />
            <span className="text-sm">
              <span className="font-medium text-white-800">Accepting orders</span>
              <span className="block text-xs text-white-500">
                Turning this off stops new customer orders immediately, across
                every table.
              </span>
            </span>
          </label>
        </Card>

        {can("settings:update") && (
          <Button type="submit" disabled={updateSettings.isPending} className="justify-self-start">
            {updateSettings.isPending ? "Saving…" : "Save settings"}
          </Button>
        )}
      </form>
    </div>
  );
};

export default AdminSettings;
