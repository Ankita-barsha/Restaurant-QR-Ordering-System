/**
 * Privacy Policy & DPDP Data Protection Notice (#35).
 *
 * Outlines purpose of data collection, diner consent rights, data retention,
 * and DPDP compliance for order fulfillment and table reservations.
 */

import { Link } from "react-router-dom";
import CustomerFooter from "../../components/CustomerFooter";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-obsidian text-ivory">
      <header className="border-b border-smoke px-4 pb-8 pt-12 sm:px-6 sm:pb-10 sm:pt-14 text-center">
        <p className="eyebrow">Legal & Compliance</p>
        <h1 className="mt-3 text-[clamp(2rem,6vw,3.5rem)] text-ivory">Privacy & Data Protection Notice</h1>
        <p className="mt-2 text-xs text-ivory-dim">Compliant with Digital Personal Data Protection (DPDP) Act</p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 space-y-8 text-sm leading-relaxed text-ivory-dim">
        <section className="rounded-2xl border border-smoke bg-charcoal p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate">1. Data We Collect</h2>
          <p className="mt-3">
            When you place an order, reserve a table, or request an invoice, we collect personal information you voluntarily provide:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-ivory">
            <li>Guest Name</li>
            <li>Mobile Phone Number (for order updates & SMS receipts)</li>
            <li>Email Address (optional)</li>
            <li>Table Number and Dining Preference</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-smoke bg-charcoal p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate">2. Purpose of Collection</h2>
          <p className="mt-3">Your personal data is strictly used for:</p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-ivory">
            <li>Processing & delivering your meal order to your table</li>
            <li>Issuing GST-compliant tax invoices</li>
            <li>Sending real-time order status notifications</li>
            <li>Managing table reservations</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-smoke bg-charcoal p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate">3. Consent & Your Rights</h2>
          <p className="mt-3">
            By placing an order or reserving a table, you consent to processing your contact details for service delivery. You may opt out of non-essential communications (such as review reminders) at any time directly on your order tracking page.
          </p>
        </section>

        <section className="rounded-2xl border border-smoke bg-charcoal p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate">4. Data Retention</h2>
          <p className="mt-3">
            Transaction and tax invoice records are retained in compliance with statutory GST regulations. Non-statutory diner contact details are not sold or shared with third parties.
          </p>
        </section>

        <div className="text-center pt-4">
          <Link to="/menu" className="inline-block rounded-full bg-gold px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-light">
            Back to Menu
          </Link>
        </div>
      </main>

      <CustomerFooter />
    </div>
  );
};

export default PrivacyPolicy;
