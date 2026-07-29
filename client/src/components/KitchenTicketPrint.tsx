/**
 * Kitchen Order Ticket (KOT) Thermal Print Layout (#32)
 *
 * Formatted specifically for standard 80mm thermal receipt printers.
 * Renders order number, table number, timestamp, itemized list with quantities & notes.
 * Explicit inline styles guarantee maximum contrast on screen and in print, overriding dark mode themes.
 */

import React from "react";
import type { Order } from "../types/api";

interface KitchenTicketPrintProps {
  order: Order;
  onClose: () => void;
}

export const KitchenTicketPrint: React.FC<KitchenTicketPrintProps> = ({ order, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm print:p-0"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.82)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 shadow-2xl print:max-w-none print:shadow-none"
        style={{
          backgroundColor: "#ffffff",
          color: "#0f172a",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Actions for screen view */}
        <div
          className="mb-4 flex items-center justify-between border-b pb-3 print:hidden"
          style={{ borderColor: "#e2e8f0" }}
        >
          <h3 className="font-bold text-base" style={{ color: "#0f172a" }}>
            KOT Preview
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg px-4 py-1.5 text-xs font-bold shadow transition-colors"
              style={{ backgroundColor: "#ea580c", color: "#ffffff" }}
            >
              Print Ticket
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ backgroundColor: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Thermal Print Receipt Template */}
        <div className="font-mono text-xs leading-tight" style={{ color: "#0f172a" }}>
          <div className="border-b pb-2 text-center" style={{ borderColor: "#000000" }}>
            <h2 className="text-lg font-black tracking-wider" style={{ color: "#000000" }}>
              KITCHEN ORDER TICKET (KOT)
            </h2>
            <p className="mt-1 text-sm font-bold" style={{ color: "#000000" }}>
              Table: {order.table ? order.table.tableNumber : "TAKEAWAY"}
            </p>
            <p className="text-[11px] font-semibold" style={{ color: "#1e293b" }}>
              Order #: {order.orderNumber}
            </p>
            <p className="text-[10px]" style={{ color: "#475569" }}>
              Date: {new Date(order.placedAt).toLocaleString("en-IN")}
            </p>
          </div>

          <table className="mt-3 w-full border-b pb-2" style={{ borderColor: "#000000" }}>
            <thead>
              <tr className="border-b border-dashed text-left" style={{ borderColor: "#000000" }}>
                <th className="py-1 font-bold" style={{ color: "#000000" }}>
                  QTY
                </th>
                <th className="py-1 font-bold" style={{ color: "#000000" }}>
                  ITEM
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b" style={{ borderColor: "#e2e8f0" }}>
                  <td className="align-top font-bold py-1.5 text-sm" style={{ color: "#000000" }}>
                    {item.quantity}x
                  </td>
                  <td className="py-1.5">
                    <span className="font-bold text-sm" style={{ color: "#000000" }}>
                      {item.foodName}
                    </span>
                    {item.notes && (
                      <p className="text-[10px] italic font-medium" style={{ color: "#334155" }}>
                        Note: {item.notes}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {order.notes && (
            <div className="mt-2 border-b pb-2" style={{ borderColor: "#000000" }}>
              <p className="font-bold" style={{ color: "#000000" }}>
                ORDER NOTES:
              </p>
              <p className="text-[11px]" style={{ color: "#0f172a" }}>
                {order.notes}
              </p>
            </div>
          )}

          <div className="mt-3 text-center text-[10px] font-bold uppercase" style={{ color: "#000000" }}>
            *** END OF TICKET ***
          </div>
          <div
            className="mt-2 text-center text-[9px] font-bold uppercase tracking-wider"
            style={{ color: "#ea580c" }}
          >
            Powered by MONK DEVELOPER
          </div>
        </div>
      </div>
    </div>
  );
};
