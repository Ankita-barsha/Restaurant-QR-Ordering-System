/**
 * GST Tax Invoice — on screen, on paper, and as a PDF. (#25)
 *
 * Implements Indian GST tax invoice presentation:
 * - Legal Name, Registered Address, GSTIN & FSSAI License No.
 * - Financial Year Serial Numbering & Place of Supply
 * - HSN/SAC Item Code (996331)
 * - CGST & SGST intra-state tax split table
 *
 * NOTE: This component intentionally uses hardcoded slate/stone color classes
 * instead of CSS custom property aliases (text-white-*, bg-charcoal, etc.)
 * because the invoice paper must always render as a white document — both on
 * screen in dark mode and when printed. CSS variable overrides from the dark-
 * mode theme would make text invisible on the white background.
 */

import { useQuery } from "@tanstack/react-query";

import { config } from "../config/env";
import { api, getErrorMessage, unwrap } from "../lib/api";
import { formatMoney, imageUrl } from "../lib/format";
import type { ApiResponse, Invoice } from "../types/api";
import { LuxeButton, LuxeError, LuxeLoader } from "./luxe";

type Source = { orderId: string } | { trackingToken: string };

const invoicePath = (source: Source): string =>
  "orderId" in source
    ? `/orders/${source.orderId}/invoice`
    : `/orders/track/${source.trackingToken}/invoice`;

const PRINT_STYLES = `
@media print {
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
    background: #fff !important;
    color: #0f172a !important;
  }

  #invoice-sheet .no-print { display: none !important; }
}
`;

/** A label/value row used in the totals section. Always on white paper. */
const Row = ({
  label,
  value,
  strong,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) => (
  <div
    className={`flex justify-between gap-6 py-1.5 ${
      strong ? "border-t border-slate-300 pt-3 text-base font-bold" : "text-sm"
    } ${className}`}
  >
    <span className={strong ? "text-slate-900" : "text-slate-600"}>{label}</span>
    <span className="tabular-nums text-slate-900 font-medium">{value}</span>
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

      {/*
       * The invoice-paper div is intentionally NOT using CSS custom property
       * colour classes. It is a white paper document that must be legible
       * regardless of whether the rest of the UI is in dark or light mode.
       * All text colours are hardcoded slate values.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tax Invoice"
        onClick={(event) => event.stopPropagation()}
        className="invoice-paper mx-auto my-2 max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:my-4 sm:p-8 md:p-10"
        style={{ color: "#0f172a" }}
      >
        {invoiceQuery.isLoading && <LuxeLoader label="Preparing GST Tax Invoice" />}

        {invoiceQuery.isError && (
          <LuxeError
            message={getErrorMessage(invoiceQuery.error)}
            onRetry={() => void invoiceQuery.refetch()}
          />
        )}

        {invoice && (
          <>
            {/* ------------------------------------------------ Header / Supplier Info */}
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
                  <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                    {invoice.restaurant.name}
                  </h2>
                  {invoice.restaurant.legalName &&
                    invoice.restaurant.legalName !== invoice.restaurant.name && (
                      <p className="text-xs font-semibold text-slate-500">
                        ({invoice.restaurant.legalName})
                      </p>
                    )}

                  {invoice.restaurant.address && (
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
                      {invoice.restaurant.address}
                    </p>
                  )}

                  <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                    <p>
                      <span className="font-bold text-slate-900">GSTIN:</span>{" "}
                      {invoice.restaurant.gstin ?? invoice.gstin ?? "27AAAAA0000A1Z5"}
                    </p>
                    <p>
                      <span className="font-bold text-slate-900">FSSAI Lic No:</span>{" "}
                      {invoice.restaurant.fssaiLicence ??
                        invoice.fssaiLicence ??
                        "10019022009876"}
                    </p>
                    {invoice.restaurant.phone && (
                      <p className="text-slate-600">Ph: {invoice.restaurant.phone}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block rounded-md bg-orange-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-orange-800">
                  Tax Invoice
                </span>
                <p className="mt-2 text-base font-bold text-slate-900">
                  {invoice.invoiceNumber}
                </p>
                <p className="text-xs text-slate-500">Order: {invoice.orderNumber}</p>
                <p className="text-xs text-slate-500">
                  Date:{" "}
                  {new Date(invoice.issuedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {invoice.placeOfSupply && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Place of Supply:{" "}
                    <span className="font-medium text-slate-700">
                      {invoice.placeOfSupply}
                    </span>
                  </p>
                )}
              </div>
            </header>

            {invoice.isCancelled && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                This order was cancelled. This document is a record, not a request for
                payment.
              </p>
            )}

            {/* ------------------------------------------------ Customer & Order Metadata */}
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 bg-slate-50 p-4 rounded-xl">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  {invoice.orderType === "DINE_IN" ? "Table" : "Order Type"}
                </dt>
                <dd className="mt-0.5 font-bold text-slate-900">
                  {invoice.table ? `Table ${invoice.table}` : "Takeaway"}
                </dd>
              </div>

              {invoice.customer?.name && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Guest Name
                  </dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {invoice.customer.name}
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Payment Status
                </dt>
                <dd className="mt-0.5 font-bold text-emerald-700">
                  {invoice.payment.status}
                  {invoice.payment.method ? ` (${invoice.payment.method})` : ""}
                </dd>
              </div>
            </dl>

            {/* ------------------------------------------------ Itemized GST Table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wider text-slate-600">
                    <th className="py-2.5 font-bold text-slate-700">Item Description</th>
                    <th className="py-2.5 text-center font-bold text-slate-700">
                      HSN/SAC
                    </th>
                    <th className="py-2.5 text-right font-bold text-slate-700">Qty</th>
                    <th className="py-2.5 text-right font-bold text-slate-700">Rate</th>
                    <th className="py-2.5 text-right font-bold text-slate-700">Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3">
                        <span className="font-semibold text-slate-900">{item.name}</span>
                        {item.notes && (
                          <span className="block text-xs text-slate-500 italic">
                            Note: {item.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-xs text-slate-500 font-mono">
                        {item.hsnSac ?? "996331"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-medium text-slate-800">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-600">
                        {money(item.unitPrice)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-bold text-slate-900">
                        {money(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ------------------------------------------------ Totals & Tax Split */}
            <div className="mt-6 ml-auto max-w-xs">
              <Row
                label="Taxable Value (Subtotal)"
                value={money(invoice.totals.subtotal)}
              />

              <Row
                label={`CGST (${invoice.totals.cgstRate ?? "2.5%"})`}
                value={money(
                  invoice.totals.cgstTotal ??
                    (Number(invoice.totals.tax) / 2).toString()
                )}
              />
              <Row
                label={`SGST (${invoice.totals.sgstRate ?? "2.5%"})`}
                value={money(
                  invoice.totals.sgstTotal ??
                    (Number(invoice.totals.tax) / 2).toString()
                )}
              />

              {Number(invoice.totals.discount) > 0 && (
                <Row
                  label="Discount"
                  value={`− ${money(invoice.totals.discount)}`}
                />
              )}

              {invoice.totals.roundOff && Number(invoice.totals.roundOff) !== 0 && (
                <Row label="Round Off" value={money(invoice.totals.roundOff)} />
              )}

              <Row
                label="Grand Total (Incl. Taxes)"
                value={money(invoice.totals.grandTotal)}
                strong
              />

              {Number(invoice.totals.balanceDue) > 0 ? (
                <p className="mt-2 text-right text-xs font-bold text-amber-700">
                  Balance Due: {money(invoice.totals.balanceDue)}
                </p>
              ) : (
                <p className="mt-2 text-right text-xs font-bold text-emerald-700">
                  Paid in Full
                  {invoice.payment.receiptNumber
                    ? ` · Receipt ${invoice.payment.receiptNumber}`
                    : ""}
                </p>
              )}
            </div>

            <p className="mt-8 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">
              Thank you for dining with {invoice.restaurant.name}. This is a
              computer-generated GST tax invoice.
            </p>
            <p className="mt-1 text-center text-[10px] text-slate-400">
              Software System Powered by{" "}
              <span className="font-bold text-orange-600">MONK DEVELOPER</span>
            </p>

            {/* ------------------------------------------------ Actions */}
            <div className="no-print mt-6 grid gap-2 border-t border-slate-200 pt-5 xs:flex xs:flex-wrap xs:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>

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
                className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700"
              >
                Print Tax Invoice
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
