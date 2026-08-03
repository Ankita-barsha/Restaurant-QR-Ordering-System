/**
 * 80mm Thermal POS Receipt Slip (#25, #32, #40)
 *
 * Formatted specifically for standard 80mm (3.15 in) thermal receipt printers
 * (EPSON, TVS, Xprinter, Star Micronics, Posiflex) used in restaurants.
 *
 * Rendered on screen as a realistic white thermal paper roll and on paper via @media print.
 * Overrides dark mode custom properties so text is always dark slate on white paper.
 */

import { useQuery } from "@tanstack/react-query";
import React from "react";

import defaultLogo from "../assets/image/logo.png";
import { config } from "../config/env";
import { api, getErrorMessage, unwrap } from "../lib/api";
import { formatMoney, imageUrl } from "../lib/format";
import type { ApiResponse, Invoice, Order } from "../types/api";
import { LuxeError, LuxeLoader } from "./luxe";

export type ThermalReceiptSource =
  | { orderId: string }
  | { trackingToken: string }
  | { order: Order };

interface ThermalReceiptSheetProps {
  source: ThermalReceiptSource;
  onClose: () => void;
  onSwitchToA4?: () => void;
}

const THERMAL_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #thermal-receipt-modal, #thermal-receipt-modal * { visibility: visible !important; }

  #thermal-receipt-modal {
    position: absolute !important;
    inset: 0 auto auto 0 !important;
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
  }

  #thermal-receipt-modal .thermal-paper {
    box-shadow: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    width: 80mm !important;
    max-width: 80mm !important;
    padding: 2mm !important;
    background: #ffffff !important;
    color: #000000 !important;
  }

  #thermal-receipt-modal .no-print { display: none !important; }
}
`;

export const ThermalReceiptSheet: React.FC<ThermalReceiptSheetProps> = ({
  source,
  onClose,
  onSwitchToA4,
}) => {
  const invoicePath =
    "orderId" in source
      ? `/orders/${source.orderId}/invoice`
      : "trackingToken" in source
      ? `/orders/track/${source.trackingToken}/invoice`
      : null;

  const invoiceQuery = useQuery({
    queryKey: ["invoice", invoicePath],
    queryFn: async () => {
      if (!invoicePath) return null;
      return unwrap(await api.get<ApiResponse<Invoice>>(invoicePath));
    },
    enabled: Boolean(invoicePath),
  });

  const invoiceData = invoiceQuery.data;
  const directOrder = "order" in source ? source.order : null;

  const isLoading = Boolean(invoicePath) && invoiceQuery.isLoading;
  const error = invoiceQuery.isError ? getErrorMessage(invoiceQuery.error) : null;

  const restaurantName =
    invoiceData?.restaurant?.name || "Bite me Bistro";
  const legalName = invoiceData?.restaurant?.legalName;
  const address = invoiceData?.restaurant?.address;
  const gstin = invoiceData?.restaurant?.gstin || invoiceData?.gstin || "27AAAAA0000A1Z5";
  const fssai =
    invoiceData?.restaurant?.fssaiLicence || invoiceData?.fssaiLicence || "10019022009876";
  const phone = invoiceData?.restaurant?.phone;

  const logoSrc = invoiceData?.restaurant?.logoUrl
    ? imageUrl(invoiceData.restaurant.logoUrl, config.apiUrl)
    : defaultLogo;

  const orderNumber = invoiceData?.orderNumber || directOrder?.orderNumber || "ORD-000";
  const tableName =
    invoiceData?.table || directOrder?.table?.tableNumber || "Takeaway";
  const customerName =
    invoiceData?.customer?.name || directOrder?.customer?.name || "Guest";
  const customerPhone = invoiceData?.customer?.phone || directOrder?.customer?.phone;
  const issuedAt = invoiceData?.issuedAt || directOrder?.placedAt || new Date().toISOString();
  const orderType = invoiceData?.orderType || directOrder?.type || "DINE_IN";
  const paymentStatus = directOrder?.paymentStatus || (invoiceData?.totals?.balanceDue === "0.00" ? "PAID" : "UNPAID");

  const subtotal = invoiceData?.totals?.subtotal || directOrder?.subtotal || "0.00";
  const taxAmount = invoiceData?.totals?.tax || directOrder?.taxAmount || "0.00";
  const cgstAmount = (Number(taxAmount) / 2).toFixed(2);
  const sgstAmount = (Number(taxAmount) / 2).toFixed(2);
  const discountAmount = invoiceData?.totals?.discount || directOrder?.discountAmount || "0.00";
  const totalAmount = invoiceData?.totals?.grandTotal || directOrder?.totalAmount || "0.00";
  const currency = invoiceData?.restaurant?.currency || "INR";

  const items = invoiceData?.items || directOrder?.items || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="thermal-receipt-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-3 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <style>{THERMAL_PRINT_STYLES}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Thermal Receipt"
        onClick={(e) => e.stopPropagation()}
        className="thermal-paper relative my-4 w-full max-w-[340px] rounded-2xl bg-white p-5 shadow-2xl text-slate-950 font-mono text-xs leading-tight"
        style={{ color: "#000000", backgroundColor: "#ffffff" }}
      >
        {/* Action Controls for Screen */}
        <div className="no-print mb-4 border-b border-slate-200 pb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-700">
              🖨️ Thermal Receipt (80mm Slip)
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-orange-700 transition"
            >
              Print 80mm Slip
            </button>
            {onSwitchToA4 && (
              <button
                type="button"
                onClick={onSwitchToA4}
                className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
              >
                A4 GST Invoice
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <LuxeLoader label="Fetching bill data..." />
        ) : error ? (
          <LuxeError message={error} />
        ) : (
          <div>
            {/* Header / Brand Emblem */}
            <div className="text-center pb-2 border-b border-dashed border-slate-900">
              {logoSrc && (
                <img
                  src={logoSrc}
                  alt=""
                  className="mx-auto h-12 w-12 object-contain rounded-full border border-slate-300 p-0.5 bg-slate-50 mb-1"
                />
              )}
              <h1 className="text-base font-black uppercase tracking-wider text-black">
                {restaurantName}
              </h1>
              {legalName && legalName !== restaurantName && (
                <p className="text-[10px] font-semibold text-slate-700">({legalName})</p>
              )}
              {address && <p className="text-[10px] text-slate-800 mt-0.5">{address}</p>}
              <div className="mt-1 text-[10px] space-y-0.5 font-sans">
                <p><span className="font-bold">GSTIN:</span> {gstin}</p>
                <p><span className="font-bold">FSSAI Lic:</span> {fssai}</p>
                {phone && <p><span className="font-bold">Ph:</span> {phone}</p>}
              </div>
            </div>

            {/* Receipt Metadata */}
            <div className="py-2 border-b border-dashed border-slate-900 text-[11px] space-y-0.5">
              <div className="flex justify-between font-bold">
                <span>Order #: {orderNumber}</span>
                <span>{orderType}</span>
              </div>
              <div className="flex justify-between">
                <span>Table: <strong className="text-black font-extrabold">{tableName}</strong></span>
                <span>Customer: {customerName}</span>
              </div>
              {customerPhone && (
                <p className="text-[10px] text-slate-700">Phone: {customerPhone}</p>
              )}
              <p className="text-[10px] text-slate-600">
                Date: {new Date(issuedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>

            {/* Itemized Table */}
            <div className="py-2 border-b border-dashed border-slate-900">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-1 w-8">QTY</th>
                    <th className="py-1">ITEM</th>
                    <th className="py-1 text-right">AMT ({currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => {
                    const nameStr = ("name" in item && item.name) ? item.name : ("foodName" in item ? item.foodName : "Item");
                    const qty = item.quantity;
                    const lineTot = item.lineTotal;
                    return (
                      <tr key={idx} className="align-top">
                        <td className="py-1 font-bold">{qty}×</td>
                        <td className="py-1">
                          <span className="font-bold">{nameStr}</span>
                          {"notes" in item && item.notes && (
                            <span className="block text-[9px] text-slate-600 font-sans italic">
                              ({item.notes})
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-right font-semibold">{formatMoney(lineTot, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Calculation Totals */}
            <div className="py-2 border-b border-dashed border-slate-900 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold">{formatMoney(subtotal, currency)}</span>
              </div>
              {Number(taxAmount) > 0 && (
                <>
                  <div className="flex justify-between text-[10px] text-slate-700">
                    <span>CGST (2.5%)</span>
                    <span>{formatMoney(cgstAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-700">
                    <span>SGST (2.5%)</span>
                    <span>{formatMoney(sgstAmount, currency)}</span>
                  </div>
                </>
              )}
              {Number(discountAmount) > 0 && (
                <div className="flex justify-between text-[10px] text-red-600 font-bold">
                  <span>Discount</span>
                  <span>- {formatMoney(discountAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-900 pt-1.5 text-sm font-black">
                <span>TOTAL PAYABLE</span>
                <span>{formatMoney(totalAmount, currency)}</span>
              </div>
            </div>

            {/* Payment Status & Footer */}
            <div className="pt-3 text-center space-y-2">
              <div className="inline-block rounded-md border border-slate-900 px-3 py-1 text-xs font-black uppercase tracking-widest">
                STATUS: {paymentStatus}
              </div>

              <div className="pt-2 text-[10px] leading-tight text-slate-700 font-sans">
                <p className="font-bold text-slate-900">Thank you for dining with us!</p>
                <p className="text-[9px] mt-0.5">Please visit again soon 🍷</p>
                <div className="mt-2 text-[8px] tracking-widest text-slate-500 uppercase border-t border-slate-200 pt-1">
                  POS System by MONK DEVELOPER
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThermalReceiptSheet;
