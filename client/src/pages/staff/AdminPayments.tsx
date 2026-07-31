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
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
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
  SUCCESS: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 font-semibold",
  PENDING: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 font-semibold",
  FAILED: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30 font-semibold",
  REFUNDED: "bg-slate-500/15 text-ivory-dim ring-1 ring-slate-500/30 font-semibold",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ivory font-display">Payments Ledger</h1>
        <p className="mt-0.5 text-sm text-ivory-dim">
          Every payment attempt, online and cash transactions.
        </p>
      </div>

      <Card className="bg-charcoal">
        <p className="text-xs font-medium uppercase tracking-wide text-ivory-dim">
          Collected ({FILTERS[filter].label.toLowerCase()})
        </p>
        <p className="mt-1 text-3xl font-black text-gold">
          {formatMoney(query.data?.totalCollected ?? "0.00")}
        </p>
      </Card>

      {refund.isError && (
        <div>
          <ErrorBox message={getErrorMessage(refund.error)} />
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((option, index) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setFilter(index)}
            className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
              filter === index
                ? "bg-gold text-obsidian shadow-sm"
                : "bg-graphite border border-smoke text-ivory-dim hover:border-gold/50 hover:text-ivory"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {payments.length === 0 ? (
        <div>
          <EmptyState title="No payments recorded" hint="Payments will appear here as orders are settled." />
        </div>
      ) : (
        <Card className="divide-y divide-smoke p-0 bg-charcoal">
          {payments.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-graphite/30 transition">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ivory font-mono">
                  {payment.receiptNumber ?? "—"}
                  {payment.order && (
                    <span className="ml-2.5 text-sm font-normal text-gold">
                      Order #{payment.order.orderNumber}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ivory-dim">
                  {new Date(payment.createdAt).toLocaleString()} · {payment.provider}
                </p>
              </div>

              <span className="rounded-full bg-graphite border border-smoke px-3 py-1 text-xs font-semibold text-ivory-dim">
                {payment.method}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  STATUS_STYLE[payment.status]
                }`}
              >
                {payment.status}
              </span>

              <span className="w-28 text-right text-base font-bold text-gold">
                {formatMoney(payment.amount)}
              </span>

              {canRefund && payment.status === "SUCCESS" && (
                <button
                  type="button"
                  onClick={() => askAndRefund(payment)}
                  disabled={refund.isPending}
                  className="rounded-lg border border-ember/50 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/15 disabled:opacity-50"
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
