/**
 * Kitchen Order Ticket (KOT) Thermal Print Layout (#32)
 *
 * Formatted specifically for standard 80mm thermal receipt printers.
 * Renders order number, table number, timestamp, itemized list with quantities & notes.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm print:p-0">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-black shadow-2xl print:max-w-none print:shadow-none">
        {/* Actions for screen view */}
        <div className="mb-4 flex items-center justify-between border-b pb-3 print:hidden">
          <h3 className="font-bold text-slate-800">KOT Preview</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-orange-700"
            >
              Print Ticket
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        {/* Thermal Print Receipt Template */}
        <div className="font-mono text-xs leading-tight">
          <div className="border-b border-black pb-2 text-center">
            <h2 className="text-lg font-black tracking-wider">KITCHEN ORDER TICKET (KOT)</h2>
            <p className="mt-1 text-sm font-bold">Table: {order.table ? order.table.tableNumber : "TAKEAWAY"}</p>
            <p className="text-[11px]">Order #: {order.orderNumber}</p>
            <p className="text-[10px] text-slate-600">
              Date: {new Date(order.placedAt).toLocaleString("en-IN")}
            </p>
          </div>

          <table className="mt-3 w-full border-b border-black pb-2">
            <thead>
              <tr className="border-b border-dashed border-black text-left">
                <th className="py-1">QTY</th>
                <th className="py-1">ITEM</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="align-top font-bold py-1.5 text-sm">{item.quantity}x</td>
                  <td className="py-1.5">
                    <span className="font-bold text-sm">{item.foodName}</span>
                    {item.notes && (
                      <p className="text-[10px] italic text-slate-700">Note: {item.notes}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {order.notes && (
            <div className="mt-2 border-b border-black pb-2">
              <p className="font-bold">ORDER NOTES:</p>
              <p className="text-[11px]">{order.notes}</p>
            </div>
          )}

          <div className="mt-3 text-center text-[10px] font-bold uppercase">
            *** END OF TICKET ***
          </div>
        </div>
      </div>
    </div>
  );
};
