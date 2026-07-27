/**
 * Payment history — the ledger.
 *
 * Every payment attempt: online and cash, successful and failed. Filterable by
 * status and method so the manager can reconcile the till or investigate a
 * failed online attempt.
 *
 * A successful payment can be refunded here. That is the only route back: the
 * order screen deliberately refuses to mark a paid order unpaid, because doing
 * so would orphan a receipt the customer is holding.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { api, getErrorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import type { ApiResponse, PaginationMeta } from "../../types/api";

interface Payment {
  id: string;
  receiptNumber: string | null;
  amount: string;
  method: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  provider: string;
  paidAt: string | null;
  createdAt: string;
  order: { orderNumber: string } | null;
}

interface PaymentsResponse extends ApiResponse<Payment[]> {
  summary?: { totalCollected: string };
}

const STATUS_STYLE: Record<Payment["status"], string> = {
  SUCCESS: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-700",
  REFUNDED: "bg-slate-100 text-slate-600",
};

const FILTERS: { label: string; status?: Payment["status"]; method?: string }[] = [
  { label: "All" },
  { label: "Online", method: "ONLINE" },
  { label: "Cash", method: "CASH" },
  { label: "Successful", status: "SUCCESS" },
  { label: "Failed", status: "FAILED" },
];

const AdminPayments = () => {
  const [filter, setFilter] = useState(0);
  const queryClient = useQueryClient();
  const { can } = useAuth();

  // Refunding is a financial reversal, gated on the same capability as voiding
  // an order — waiting staff who can take a payment must not be able to undo it.
  const canRefund = can("order:cancel");

  const query = useQuery({
    queryKey: ["payments", filter],
    queryFn: async () => {
      const active = FILTERS[filter];
      const params = new URLSearchParams({ limit: "50" });

      if (active.status) params.set("status", active.status);
      if (active.method) params.set("method", active.method);

      const response = await api.get<PaymentsResponse>(
        `/payments?${params.toString()}`
      );

      return {
        payments: response.data.data,
        meta: response.data.meta as PaginationMeta,
        totalCollected: response.data.summary?.totalCollected ?? "0.00",
      };
    },
  });

  const refund = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/payments/${id}/refund`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });

  const askAndRefund = (payment: Payment) => {
    const reason = window.prompt(
      `Refund ${formatMoney(payment.amount)} for ${
        payment.order?.orderNumber ?? "this payment"
      }?\n\nReason (recorded against the payment):`
    );

    // Cancelled, or left blank — the reason is mandatory, so nothing happens.
    if (!reason?.trim()) return;

    refund.mutate({ id: payment.id, reason: reason.trim() });
  };

  if (query.isLoading) return <Spinner label="Loading payments" />;

  if (query.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const payments = query.data?.payments ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Payments</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Every payment attempt, online and cash.
      </p>

      {/* Collected under the CURRENT filter, so the figure always describes
          the rows below it. Refunded payments are excluded. */}
      <Card className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Collected ({FILTERS[filter].label.toLowerCase()})
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-900">
          {formatMoney(query.data?.totalCollected ?? "0.00")}
        </p>
      </Card>

      {refund.isError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(refund.error)} />
        </div>
      )}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map((option, index) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setFilter(index)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === index
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {payments.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No payments here" hint="Payments appear as orders are settled." />
        </div>
      ) : (
        <Card className="mt-4 divide-y divide-slate-100 p-0">
          {payments.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {payment.receiptNumber ?? "—"}
                  {payment.order && (
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {payment.order.orderNumber}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(payment.createdAt).toLocaleString()} · {payment.provider}
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {payment.method}
              </span>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  STATUS_STYLE[payment.status]
                }`}
              >
                {payment.status}
              </span>

              <span className="w-24 text-right text-sm font-bold text-slate-900">
                {formatMoney(payment.amount)}
              </span>

              {canRefund && payment.status === "SUCCESS" && (
                <button
                  type="button"
                  onClick={() => askAndRefund(payment)}
                  disabled={refund.isPending}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Refund
                </button>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default AdminPayments;
