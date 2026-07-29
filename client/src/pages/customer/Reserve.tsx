/**
 * Table reservation.
 *
 * A three-step flow rather than one long form: party size, then date and
 * time, then details. Asking for a name before the guest knows a table is
 * even free is the wrong order — the availability answer is what they came
 * for, and it costs nothing to give it first.
 *
 * When a slot is full the server returns nearby times that ARE free, and
 * those are offered as buttons. A dead-end "unavailable" loses the booking.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CustomerFooter from "../../components/CustomerFooter";

import {
  LuxeButton,
  LuxeError,
  Reveal,
  SectionHeading,
} from "../../components/luxe";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse, PublicSettings } from "../../types/api";

import heroImage from "../../assets/image/hero.jpg";

interface Reservation {
  reference: string;
  name: string;
  partySize: number;
  reservedAt: string;
  status: string;
  occasion: string | null;
}

interface Availability {
  available: boolean;
  seatsRemaining: number;
  totalCapacity: number;
  alternatives: string[];
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

const OCCASIONS = ["Birthday", "Anniversary", "Business", "Celebration"];

/** The next 21 days — far enough to plan, short enough to scan. */
const upcomingDays = () =>
  Array.from({ length: 21 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    return date;
  });

/** Service runs 12:00–22:30 in half-hour sittings. */
const SERVICE_TIMES = Array.from({ length: 22 }, (_, index) => {
  const minutes = 12 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
});

const fieldClass =
  "w-full rounded-xl border border-smoke bg-charcoal px-4 py-3 text-sm text-ivory placeholder:text-ivory-faint transition-colors focus:border-gold/50 focus:outline-none";

const Reserve = () => {
  const [partySize, setPartySize] = useState(2);
  const [day, setDay] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [time, setTime] = useState<string | null>("12:00");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [confirmed, setConfirmed] = useState<Reservation | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  /** Combines the chosen day and time into a single instant. */
  const reservedAt = useMemo(() => {
    if (!time) return null;

    const [hours, minutes] = time.split(":").map(Number);
    const when = new Date(day);
    when.setHours(hours, minutes, 0, 0);

    return when;
  }, [day, time]);

  // Times already gone today must not be selectable.
  const availableTimes = useMemo(() => {
    const isToday = day.toDateString() === new Date().toDateString();

    if (!isToday) return SERVICE_TIMES;

    const now = new Date();

    return SERVICE_TIMES.filter((slot) => {
      const [hours, minutes] = slot.split(":").map(Number);
      return hours * 60 + minutes > now.getHours() * 60 + now.getMinutes() + 30;
    });
  }, [day]);

  const availabilityQuery = useQuery({
    queryKey: ["availability", reservedAt?.toISOString(), partySize],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<Availability>>(
          `/reservations/availability?date=${reservedAt!.toISOString()}&partySize=${partySize}`
        )
      ),
    enabled: reservedAt !== null,
  });

  const book = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.post<ApiResponse<Reservation>>("/reservations", {
          name,
          phone,
          email: email || undefined,
          partySize,
          reservedAt: reservedAt!.toISOString(),
          occasion: occasion ?? undefined,
          notes: notes || undefined,
        })
      ),
    onSuccess: setConfirmed,
  });

  // ------------------------------------------------------------ confirmation
  if (confirmed) {
    return (
      <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-obsidian px-6 pt-20">
        <div className="absolute inset-0">
          <img src={heroImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-obsidian/90" />
        </div>

        <div className="relative z-10 w-full max-w-md text-center">
          <p className="animate-rise eyebrow">Table requested</p>

          <h1 className="animate-rise delay-1 mt-4 text-5xl leading-tight text-ivory">
            Thank you, {confirmed.name.split(" ")[0]}
          </h1>

          <div className="glass rounded-luxe animate-rise delay-2 mt-10 p-8">
            <p className="eyebrow">Your reference</p>
            <p className="font-display mt-2 text-5xl tracking-wide text-gold-gradient">
              {confirmed.reference}
            </p>

            <div className="rule-fade my-6 h-px" />

            <dl className="grid grid-cols-2 gap-5 text-left">
              <div>
                <dt className="eyebrow">Date</dt>
                <dd className="mt-1 text-sm text-ivory">
                  {new Date(confirmed.reservedAt).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Time</dt>
                <dd className="mt-1 text-sm text-ivory">
                  {new Date(confirmed.reservedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Guests</dt>
                <dd className="mt-1 text-sm text-ivory">{confirmed.partySize}</dd>
              </div>
              <div>
                <dt className="eyebrow">Status</dt>
                <dd className="mt-1 text-sm text-gold">Awaiting confirmation</dd>
              </div>
            </dl>
          </div>

          <p className="animate-rise delay-3 mt-6 text-[13px] leading-relaxed text-ivory-faint">
            Quote this reference when you arrive. We hold tables for fifteen
            minutes past the booking time.
          </p>

          <div className="animate-rise delay-4 mt-8 flex flex-col gap-3">
            <Link to="/menu">
              <LuxeButton className="w-full">Browse the menu</LuxeButton>
            </Link>
            <Link
              to="/welcome"
              className="text-[10px] uppercase tracking-[0.24em] text-ivory-faint transition-colors hover:text-gold"
            >
              Back to the restaurant
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const availability = availabilityQuery.data;
  const slotFull = availability !== undefined && !availability.available;
  const canBook = Boolean(reservedAt && name && phone && !slotFull);

  // -------------------------------------------------------------- the form
  return (
    <div className="min-h-screen bg-obsidian px-4 pb-20 pt-24 sm:px-6 sm:pb-24 sm:pt-28">
      <div className="mx-auto max-w-2xl">
        <Reveal>
          {/* No seat count and no holding time in the lede. Both were house
              policy stated as fact on a page that cannot enforce either, and
              the seat figure in particular changed with the floor plan while
              the sentence did not. */}
          <SectionHeading
            eyebrow="Reservations"
            title="Book a table"
            lede="Choose a day and a time, and we will hold a table for you."
          />
        </Reveal>

        {/* ---------------------------------------------------- party size */}
        <section className="mt-14">
          <p className="eyebrow">How many guests</p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {PARTY_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPartySize(size)}
                aria-pressed={partySize === size}
                className={`h-12 w-12 shrink-0 rounded-full border text-sm transition-all duration-500 ${
                  partySize === size
                    ? "border-gold bg-gold text-obsidian"
                    : "border-smoke text-ivory-dim hover:border-gold/40 hover:text-gold"
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          {partySize >= 8 && (
            <p className="mt-3 text-[13px] text-ivory-faint">
              For parties over eight, please call us so we can seat you properly.
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------- date */}
        <section className="mt-12">
          <p className="eyebrow">Which day</p>

          <div className="mt-4 flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {upcomingDays().map((date) => {
              const selected = date.toDateString() === day.toDateString();
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => {
                    setDay(date);
                    setTime(null);
                  }}
                  aria-pressed={selected}
                  className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-4 py-3 transition-all duration-500 ${
                    selected
                      ? "border-gold bg-gold text-obsidian"
                      : "border-smoke text-ivory-dim hover:border-gold/40"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-[0.15em]">
                    {isToday
                      ? "Today"
                      : date.toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                  <span className="font-display text-2xl leading-none">
                    {date.getDate()}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em]">
                    {date.toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------- time */}
        <section className="mt-12">
          <p className="eyebrow">What time</p>

          {availableTimes.length === 0 ? (
            <p className="mt-4 text-[13px] text-ivory-faint">
              No sittings left today. Please choose another day.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2 xs:grid-cols-4 sm:grid-cols-6 sm:gap-2.5">
              {availableTimes.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTime(slot)}
                  aria-pressed={time === slot}
                  className={`rounded-lg border py-2.5 text-[13px] transition-all duration-500 ${
                    time === slot
                      ? "border-gold bg-gold text-obsidian"
                      : "border-smoke text-ivory-dim hover:border-gold/40 hover:text-gold"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* -------------------------------------------------- availability */}
        {reservedAt && (
          <div className="mt-8">
            {availabilityQuery.isLoading && (
              <p className="animate-pulse text-[13px] text-ivory-faint">
                Checking seat availability for {time}…
              </p>
            )}

            {availability?.available && (
              <div className="glass rounded-luxe border border-gold/30 p-5">
                <div className="flex items-center justify-between border-b border-smoke/50 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Available
                    </span>
                  </div>
                  <span className="text-[12px] text-ivory-dim">
                    Total Capacity: <strong className="text-gold">{availability.totalCapacity} Seats</strong>
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
                  <div className="rounded-xl border border-smoke/40 bg-charcoal/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ivory-faint">
                      Free Seats ({time})
                    </p>
                    <p className="font-display mt-1 text-2xl text-gold">
                      {availability.seatsRemaining}
                    </p>
                  </div>
                  <div className="rounded-xl border border-smoke/40 bg-charcoal/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ivory-faint">
                      Selected Guests
                    </p>
                    <p className="font-display mt-1 text-2xl text-ivory">
                      {partySize}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-smoke/40 bg-charcoal/60 p-3 sm:col-span-1">
                    <p className="text-[10px] uppercase tracking-wider text-ivory-faint">
                      Remaining After Booking
                    </p>
                    <p className="font-display mt-1 text-2xl text-emerald-400">
                      {Math.max(0, availability.seatsRemaining - partySize)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-center text-[12px] text-ivory-dim">
                  {availability.seatsRemaining - partySize > 0
                    ? `Booking for ${partySize} guest${partySize > 1 ? "s" : ""}. ${
                        availability.seatsRemaining - partySize
                      } seat${
                        availability.seatsRemaining - partySize === 1 ? "" : "s"
                      } will stay free at ${time}.`
                    : `Booking for ${partySize} guest${partySize > 1 ? "s" : ""}. Exactly enough seats available for your party!`}
                </p>
              </div>
            )}

            {slotFull && (
              <div className="glass rounded-luxe border border-ember/30 p-5">
                <p className="text-[13px] font-medium text-ember">
                  Sorry, only {availability.seatsRemaining} seat
                  {availability.seatsRemaining === 1 ? "" : "s"} available at {time}, but you selected {partySize} guests.
                </p>

                {availability.alternatives.length > 0 ? (
                  <>
                    <p className="mt-3 text-[13px] text-ivory-dim">
                      These alternative times have free seats:
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availability.alternatives.map((iso) => {
                        const alternative = new Date(iso);

                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => {
                              const next = new Date(alternative);
                              next.setHours(0, 0, 0, 0);
                              setDay(next);
                              setTime(
                                `${String(alternative.getHours()).padStart(2, "0")}:${String(
                                  alternative.getMinutes()
                                ).padStart(2, "0")}`
                              );
                            }}
                            className="rounded-full border border-gold/40 px-4 py-1.5 text-[12px] text-gold transition hover:bg-gold hover:text-obsidian"
                          >
                            {alternative.toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-ivory-faint">
                    Please call us — we may still be able to help accommodate your party.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- details */}
        <section className="mt-12">
          <p className="eyebrow">Your details</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              aria-label="Name for the booking"
              className={fieldClass}
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone"
              inputMode="tel"
              aria-label="Contact number"
              className={fieldClass}
            />
          </div>

          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email (optional)"
            type="email"
            aria-label="Email address"
            className={`${fieldClass} mt-4`}
          />

          <p className="eyebrow mt-8">Occasion</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {OCCASIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setOccasion(occasion === option ? null : option)}
                aria-pressed={occasion === option}
                className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition-all duration-500 ${
                  occasion === option
                    ? "border-gold bg-gold text-obsidian"
                    : "border-smoke text-ivory-dim hover:border-gold/40 hover:text-gold"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Allergies, seating preferences, anything we should know"
            rows={3}
            aria-label="Notes for the restaurant"
            className={`${fieldClass} mt-6`}
          />
        </section>

        {book.isError && (
          <div className="mt-8">
            <LuxeError message={getErrorMessage(book.error)} />
          </div>
        )}

        <div className="mt-10">
          <LuxeButton
            className="w-full"
            disabled={!canBook || book.isPending}
            onClick={() => book.mutate()}
          >
            {book.isPending ? "Requesting your table…" : "Request table"}
          </LuxeButton>

          {!canBook && !slotFull && (
            <p className="mt-4 text-center text-[12px] text-ivory-faint">
              {!time
                ? "Choose a time to continue"
                : "Add a name and contact number"}
            </p>
          )}
        </div>

        {settingsQuery.data?.phone && (
          <p className="mt-8 text-center text-[13px] text-ivory-faint">
            Larger party or a private room?{" "}
            <a href={`tel:${settingsQuery.data.phone}`} className="text-gold">
              Call {settingsQuery.data.phone}
            </a>
          </p>
        )}
      </div>

      <div className="mt-20">
        <CustomerFooter />
      </div>
    </div>
  );
};

export default Reserve;
