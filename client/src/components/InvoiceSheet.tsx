/**
 * Invoice — on screen, on paper, and as a PDF.
 *
 * One component serves all three. "Download PDF" opens the browser's own print
 * dialog, where every desktop and mobile browser offers "Save as PDF": that is
 * a deliberate choice over bundling a PDF library. A generator would add
 * roughly 300 kB to a bundle a diner downloads on mobile data while waiting to
 * order, and would produce a worse document — the browser already lays this
 * page out, hyphenates it and embeds the fonts.
 *
 * The print rules live in a scoped <style> rather than in index.css because
 * they are only ever true while this sheet is open. `visibility` rather than
 * `display: none` is what hides the app behind it: display would collapse the
 * fixed-position sheet along with its ancestors and print a blank page.
 */

import { useQuery } from "@tanstack/react-query";

import { config } from "../config/env";
import { api, getErrorMessage, unwrap } from "../lib/api";
import { formatMoney, imageUrl } from "../lib/format";
import type { ApiResponse, Invoice } from "../types/api";
import { LuxeButton, LuxeError, LuxeLoader } from "./luxe";

/** Where to fetch from: staff read by order id, a diner by their own token. */
type Source = { orderId: string } | { trackingToken: string };

const invoicePath = (source: Source): string =>
  "orderId" in source
    ? `/orders/${source.orderId}/invoice`
    : `/orders/track/${source.trackingToken}/invoice`;

const PRINT_STYLES = `
@media print {
  /* Hide the application without collapsing this sheet's ancestors. */
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }

  #invoice-sheet {
    position: absolute !important;
    inset: 0 auto auto 0 !important;
    width: 100% !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    background: #fff !important;
  }

  #invoice-sheet .invoice-paper {
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* Buttons are not part of the document. */
  #invoice-sheet .no-print { display: none !important; }
}
`;

const Row = ({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div
    className={`flex justify-between gap-6 py-1.5 ${
      strong ? "border-t border-slate-300 pt-3 text-base font-bold" : "text-sm"
    }`}
  >
    <span className={strong ? "text-slate-900" : "text-slate-600"}>{label}</span>
    <span className="tabular-nums text-slate-900">{value}</span>
  </div>
);

const InvoiceSheet = ({
  source,
  onClose,
}: {
  source: Source;
  onClose: () => void;
}) => {
  const path = invoicePath(source);

  const invoiceQuery = useQuery({
    queryKey: ["invoice", path],
    queryFn: async () => unwrap(await api.get<ApiResponse<Invoice>>(path)),
  });

  const invoice = invoiceQuery.data;
  const currency = invoice?.restaurant.currency ?? "INR";
  const money = (value: string) => formatMoney(value, currency);
  const logo = imageUrl(invoice?.restaurant.logoUrl ?? null, config.apiUrl);

  return (
    <div
      id="invoice-sheet"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <style>{PRINT_STYLES}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invoice"
        onClick={(event) => event.stopPropagation()}
        className="invoice-paper mx-auto my-2 max-w-2xl rounded-2xl bg-white p-5 text-slate-900 shadow-xl sm:my-4 sm:p-8 md:p-10"
      >
        {invoiceQuery.isLoading && <LuxeLoader label="Preparing the invoice" />}

        {invoiceQuery.isError && (
          <LuxeError
            message={getErrorMessage(invoiceQuery.error)}
            onRetry={() => void invoiceQuery.refetch()}
          />
        )}

        {invoice && (
          <>
            {/* ------------------------------------------------ letterhead */}
            <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
              <div className="flex items-start gap-4">
                {logo && (
                  <img
                    src={logo}
                    alt=""
                    className="h-14 w-14 rounded-lg object-contain"
                  />
                )}

                <div>
                  <h2 className="text-xl font-bold sm:text-2xl">{invoice.restaurant.name}</h2>

                  {invoice.restaurant.address && (
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
                      {invoice.restaurant.address}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-slate-500">
                    {[invoice.restaurant.phone, invoice.restaurant.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Invoice
                </p>
                <p className="text-lg font-bold">{invoice.invoiceNumber}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Order {invoice.orderNumber}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(invoice.issuedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </header>

            {invoice.isCancelled && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                This order was cancelled. This document is a record, not a request
                for payment.
              </p>
            )}

            {/* ------------------------------------------------- the party */}
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  {invoice.orderType === "DINE_IN" ? "Table" : "Order type"}
                </dt>
                <dd className="mt-0.5 font-semibold">
                  {invoice.table ?? "Takeaway"}
                </dd>
              </div>

              {invoice.customer?.name && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">
                    Guest
                  </dt>
                  <dd className="mt-0.5 font-semibold">{invoice.customer.name}</dd>
                </div>
              )}

              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">
                  Payment
                </dt>
                <dd className="mt-0.5 font-semibold">
                  {invoice.payment.status}
                  {invoice.payment.method ? ` · ${invoice.payment.method}` : ""}
                </dd>
              </div>
            </dl>

            {/* ----------------------------------------------------- items */}
            {/* Scrolls inside its own container on a narrow phone rather than
                making the whole sheet scroll sideways. */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="py-2 font-semibold">Item</th>
                    <th className="py-2 text-right font-semibold">Qty</th>
                    <th className="py-2 text-right font-semibold">Price</th>
                    <th className="py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3">
                        {item.name}
                        {item.notes && (
                          <span className="block text-xs text-slate-400">
                            {item.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {money(item.unitPrice)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-medium">
                        {money(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ---------------------------------------------------- totals */}
            <div className="mt-6 ml-auto max-w-xs">
              <Row label="Subtotal" value={money(invoice.totals.subtotal)} />

              {/* One line, because the order stored tax and service charge as
                  one figure — splitting them here would show a breakdown the
                  stored row cannot substantiate. */}
              <Row label="Tax & service" value={money(invoice.totals.tax)} />

              {Number(invoice.totals.discount) > 0 && (
                <Row label="Discount" value={`− ${money(invoice.totals.discount)}`} />
              )}

              <Row label="Grand total" value={money(invoice.totals.grandTotal)} strong />

              {Number(invoice.totals.balanceDue) > 0 ? (
                <p className="mt-2 text-right text-xs font-semibold text-amber-700">
                  Balance due {money(invoice.totals.balanceDue)}
                </p>
              ) : (
                <p className="mt-2 text-right text-xs font-semibold text-emerald-700">
                  Paid in full
                  {invoice.payment.receiptNumber
                    ? ` · receipt ${invoice.payment.receiptNumber}`
                    : ""}
                </p>
              )}
            </div>

            <p className="mt-8 border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
              Thank you for dining with {invoice.restaurant.name}.
            </p>
            <p className="mt-1 text-center text-[10px] text-slate-500">
              Software System Powered by <span className="font-bold text-orange-600">MONK DEVELOPER</span>
            </p>

            {/* ---------------------------------------------------- actions */}
            <div className="no-print mt-6 grid gap-2 border-t border-slate-200 pt-5 xs:flex xs:flex-wrap xs:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>

              {/* Both buttons open the same dialog: "Save as PDF" is a
                  destination inside it on every modern browser, so a second
                  code path would only be a second thing to break. */}
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Download PDF
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Print invoice
              </button>
            </div>
          </>
        )}

        {invoiceQuery.isError && (
          <div className="no-print mt-6 flex justify-end">
            <LuxeButton variant="ghost" onClick={onClose}>
              Close
            </LuxeButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceSheet;
