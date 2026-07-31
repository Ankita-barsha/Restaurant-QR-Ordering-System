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

interface Settings {
  name: string;
  tagline: string | null;
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
}

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

  const settingsQuery = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => unwrap(await api.get<ApiResponse<Settings>>("/admin/settings")),
  });

  const updateSettings = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      api.patch("/admin/settings", payload),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
      // The confirmation clears itself so it cannot be mistaken for the state
      // of a later, unsaved edit.
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
    const payload: Record<string, unknown> = {};

    for (const [key, value] of form.entries()) {
      // Empty strings are dropped rather than sent: the server's optional
      // fields reject "" for things like email.
      if (typeof value === "string" && value.trim() !== "") {
        payload[key] = value.trim();
      }
    }

    // Checkboxes are absent from FormData when unchecked, so the flag is set
    // explicitly rather than inferred from presence.
    payload.isAcceptingOrders = form.get("isAcceptingOrders") === "true";

    updateSettings.mutate(payload);
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-white-900">Restaurant settings</h1>

      {updateSettings.isError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(updateSettings.error)} />
        </div>
      )}

      {saved && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
          Settings saved.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
        <Card>
          <h2 className="font-semibold text-white-900">Identity</h2>
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
