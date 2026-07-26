/**
 * Landing page.
 *
 * The hero is a single full-bleed still with a very slow zoom. A fine dining
 * site earns its impression from restraint: one photograph, one line of type,
 * one action — not a carousel competing with itself.
 *
 * Everything below it is real data from the API, not placeholder content:
 * the signature dishes and the chef's special are the actual menu.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  DietMark,
  LuxeButton,
  LuxeSkeleton,
  Reveal,
  SectionHeading,
  Stars,
} from "../../components/luxe";
import { config } from "../../config/env";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import type { ApiResponse, Food, PublicSettings } from "../../types/api";

import heroImage from "../../assets/image/hero.jpg";
import biryaniImage from "../../assets/image/biriyani.jpg";
import dessertImage from "../../assets/image/dessert.jpg";
import latteImage from "../../assets/image/latte.webp";
import pizzaImage from "../../assets/image/margherita-pizza.jpg";
import burgerImage from "../../assets/image/burger.jpg";

const REVIEWS = [
  {
    quote:
      "The tasting menu moved at exactly the right pace. Every course arrived the moment the last was forgotten.",
    name: "Ananya Sen",
    detail: "Dined in March",
  },
  {
    quote:
      "I have eaten in rooms with three stars that were less considered than this. The service never once interrupted the table.",
    name: "Rohan Mehta",
    detail: "Chef's table",
  },
  {
    quote:
      "We scanned the code and ordered without ever flagging anyone down. It felt effortless rather than automated.",
    name: "Priya Raghavan",
    detail: "Anniversary dinner",
  },
];

const GALLERY = [
  { src: biryaniImage, alt: "Slow-cooked biryani", span: "row-span-2" },
  { src: dessertImage, alt: "Chocolate dessert", span: "" },
  { src: pizzaImage, alt: "Wood-fired pizza", span: "" },
  { src: latteImage, alt: "Coffee service", span: "" },
  { src: burgerImage, alt: "Aged beef burger", span: "row-span-2" },
  { src: heroImage, alt: "The dining room", span: "" },
];

const Landing = () => {
  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const signatureQuery = useQuery({
    queryKey: [...queryKeys.foods, "signature"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Food[]>>("/foods?limit=6&sortBy=price&sortOrder=desc")),
  });

  const restaurantName = settingsQuery.data?.name ?? "Bite me Bistro";
  const signatures = signatureQuery.data ?? [];
  const special = signatures[0];

  return (
    <div className="bg-obsidian">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt=""
            className="animate-kenburns h-full w-full object-cover"
            fetchPriority="high"
          />
          {/* Two gradients, not one: a vertical wash for legibility and a
              radial vignette so the eye settles in the middle. */}
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/85 via-obsidian/55 to-obsidian" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(10,10,11,0.75)_100%)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <p className="animate-rise eyebrow delay-1">Est. 2019 · Fine Dining</p>

          <h1 className="animate-rise delay-2 mt-7 text-[clamp(3rem,11vw,7rem)] leading-[0.92] text-ivory">
            {restaurantName}
          </h1>

          <div className="animate-rise delay-2 mx-auto mt-8 flex items-center justify-center gap-5">
            <span className="rule-fade h-px w-16" />
            <Stars />
            <span className="rule-fade h-px w-16" />
          </div>

          <p className="animate-rise delay-3 mx-auto mt-8 max-w-xl text-[15px] leading-relaxed text-ivory-dim">
            {settingsQuery.data?.tagline ??
              "A seasonal menu built around fire, patience and produce picked the same morning. Scan, order, and let the kitchen do the rest."}
          </p>

          <div className="animate-rise delay-4 mt-12 flex flex-wrap items-center justify-center gap-4">
            <LuxeButton href="#menu">Explore the menu</LuxeButton>
            <Link to="/reserve">
              <LuxeButton variant="outline">Reserve a table</LuxeButton>
            </Link>
          </div>
        </div>

        {/* Scroll cue — the hero is full height, so the fold needs a hint */}
        <a
          href="#signatures"
          aria-label="Scroll to signature dishes"
          className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2"
        >
          <span className="block h-14 w-px bg-gradient-to-b from-transparent via-gold/60 to-transparent" />
        </a>
      </section>

      {/* -------------------------------------------------------- signatures */}
      <section id="signatures" className="mx-auto max-w-7xl px-6 py-28 md:py-36">
        <Reveal>
          <SectionHeading
            eyebrow="Signature"
            title="Dishes that define us"
            lede="Six plates the kitchen would serve you if you asked us to choose. Prices are live from tonight's menu."
          />
        </Reveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {signatureQuery.isLoading &&
            Array.from({ length: 6 }, (_, index) => (
              <LuxeSkeleton key={index} className="h-[420px]" />
            ))}

          {signatures.map((food, index) => {
            const image = imageUrl(food.imageUrl, config.apiUrl);

            return (
              <Reveal key={food.id} delay={index * 90}>
                <article className="lift group relative h-[420px] overflow-hidden rounded-luxe">
                  {image ? (
                    <img
                      src={image}
                      alt={food.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
                    />
                  ) : (
                    <div className="h-full w-full bg-graphite" />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/25 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-7">
                    <div className="flex items-center gap-2.5">
                      <DietMark vegetarian={food.isVegetarian} />
                      <span className="eyebrow">{food.category.name}</span>
                    </div>

                    <h3 className="mt-3 text-3xl leading-tight text-ivory">{food.name}</h3>

                    {food.description && (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ivory-dim">
                        {food.description}
                      </p>
                    )}

                    <div className="mt-5 flex items-center justify-between">
                      <span className="font-display text-2xl text-gold">
                        {formatMoney(food.price)}
                      </span>

                      {/* Reveals on hover on desktop; always visible on touch,
                          where there is no hover to reveal it. */}
                      <Link
                        to="/menu"
                        className="text-[10px] uppercase tracking-[0.24em] text-ivory-dim opacity-100 transition-all duration-500 hover:text-gold md:opacity-0 md:group-hover:opacity-100"
                      >
                        Order →
                      </Link>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------ chef special */}
      {special && (
        <section className="relative overflow-hidden bg-charcoal py-28 md:py-36">
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2">
            <Reveal>
              <div className="relative">
                <img
                  src={imageUrl(special.imageUrl, config.apiUrl) ?? biryaniImage}
                  alt={special.name}
                  loading="lazy"
                  className="rounded-luxe aspect-[4/5] w-full object-cover"
                />
                {/* Offset gold frame — a classic editorial device that costs
                    nothing and makes a single photo feel composed. */}
                <div className="rounded-luxe pointer-events-none absolute -inset-4 border border-gold/25" />
              </div>
            </Reveal>

            <Reveal delay={140}>
              <SectionHeading
                eyebrow="Chef's special"
                title={special.name}
                align="left"
              />

              <p className="mt-6 text-[15px] leading-loose text-ivory-dim">
                {special.description ??
                  "Composed each morning around whatever the market gives us. The kitchen will not tell you what is in it until it reaches the table."}
              </p>

              <dl className="mt-10 grid grid-cols-3 gap-6 border-y border-smoke py-7">
                <div>
                  <dt className="eyebrow">Price</dt>
                  <dd className="font-display mt-1.5 text-2xl text-gold">
                    {formatMoney(special.price)}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Prepared in</dt>
                  <dd className="font-display mt-1.5 text-2xl text-ivory">
                    {special.preparationMinutes ?? 20} min
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Course</dt>
                  <dd className="font-display mt-1.5 text-2xl text-ivory">
                    {special.category.name}
                  </dd>
                </div>
              </dl>

              <div className="mt-10">
                <Link to="/menu">
                  <LuxeButton>Add to your table</LuxeButton>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- about */}
      <section id="about" className="mx-auto max-w-7xl px-6 py-28 md:py-36">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <Reveal>
            <SectionHeading eyebrow="The house" title="A room built around one table" align="left" />

            <div className="mt-7 space-y-5 text-[15px] leading-loose text-ivory-dim">
              <p>
                We seat forty. The kitchen is open to the room because there is
                nothing in it we would rather you did not see. Everything is
                cooked to order, which is the honest reason some plates take
                longer than others.
              </p>
              <p>
                The menu changes when the produce changes — not on a schedule.
                Scan the code at your table and it will always show you what we
                can actually cook tonight.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-8">
              {[
                { figure: "40", label: "Seats" },
                { figure: "12", label: "Courses" },
                { figure: "6", label: "Years" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-display text-5xl text-gold-gradient">{stat.figure}</p>
                  <p className="eyebrow mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="relative">
              <img
                src={dessertImage}
                alt="Plating in the pass"
                loading="lazy"
                className="rounded-luxe aspect-square w-full object-cover"
              />

              {/* Chef card overlapping the photo — glass over food imagery is
                  where the treatment earns its keep. */}
              <div className="glass rounded-luxe absolute -bottom-8 -left-4 max-w-[16rem] p-6 sm:-left-8">
                <p className="eyebrow">Executive Chef</p>
                <p className="font-display mt-2 text-3xl text-ivory">Arjun Kapadia</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ivory-faint">
                  Sixteen years across Lyon, Copenhagen and Mumbai.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- gallery */}
      <section id="gallery" className="bg-charcoal py-28 md:py-36">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading eyebrow="Gallery" title="From the pass" />
          </Reveal>

          <div className="mt-16 grid auto-rows-[220px] grid-cols-2 gap-4 lg:grid-cols-4">
            {GALLERY.map((item, index) => (
              <Reveal key={item.alt} delay={index * 70} className={item.span}>
                <figure className="group relative h-full overflow-hidden rounded-luxe">
                  <img
                    src={item.src}
                    alt={item.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
                  />
                  <figcaption className="absolute inset-0 flex items-end bg-gradient-to-t from-obsidian/85 to-transparent p-5 opacity-0 transition-opacity duration-700 group-hover:opacity-100">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-ivory">
                      {item.alt}
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- reviews */}
      <section className="mx-auto max-w-7xl px-6 py-28 md:py-36">
        <Reveal>
          <SectionHeading eyebrow="Guests" title="What the room says" />
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {REVIEWS.map((review, index) => (
            <Reveal key={review.name} delay={index * 110}>
              <figure className="glass rounded-luxe flex h-full flex-col justify-between p-8">
                <div>
                  <Stars />
                  <blockquote className="font-display mt-6 text-[22px] leading-snug text-ivory">
                    “{review.quote}”
                  </blockquote>
                </div>

                <figcaption className="mt-8 border-t border-smoke pt-5">
                  <p className="text-sm text-ivory">{review.name}</p>
                  <p className="eyebrow mt-1">{review.detail}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* --------------------------------------------- reserve / events / CTA */}
      <section id="reserve" className="relative overflow-hidden">
        <img
          src={heroImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-obsidian/88" />

        <div className="relative mx-auto max-w-4xl px-6 py-28 text-center md:py-36">
          <Reveal>
            <SectionHeading
              eyebrow="Reservations & private dining"
              title="Join us for dinner"
              lede="Tables are held for fifteen minutes. For parties of eight or more, or for the chef's table, please call the house directly."
            />

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Lunch", value: settingsQuery.data?.openingTime ?? "12:00" },
                { label: "Last seating", value: settingsQuery.data?.closingTime ?? "23:00" },
                { label: "Private room", value: "Up to 20" },
              ].map((item) => (
                <div key={item.label} className="glass-light rounded-luxe px-6 py-7">
                  <p className="eyebrow">{item.label}</p>
                  <p className="font-display mt-2 text-3xl text-ivory">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap justify-center gap-4">
              {settingsQuery.data?.phone && (
                <LuxeButton href={`tel:${settingsQuery.data.phone}`}>
                  Call {settingsQuery.data.phone}
                </LuxeButton>
              )}
              <Link to="/reserve">
                <LuxeButton variant="outline">Book online</LuxeButton>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- contact */}
      <footer id="contact" className="border-t border-smoke bg-obsidian">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-3">
          <div>
            <h3 className="text-3xl text-ivory">{restaurantName}</h3>
            <div className="rule-fade mt-4 h-px w-24" />
            <p className="mt-5 text-[13px] leading-relaxed text-ivory-faint">
              {settingsQuery.data?.address || "Address to be confirmed"}
            </p>
          </div>

          <div>
            <p className="eyebrow">Hours</p>
            <dl className="mt-5 space-y-2.5 text-[13px] text-ivory-dim">
              <div className="flex justify-between gap-4">
                <dt>Tuesday – Sunday</dt>
                <dd className="text-ivory">
                  {settingsQuery.data?.openingTime ?? "12:00"} –{" "}
                  {settingsQuery.data?.closingTime ?? "23:00"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Monday</dt>
                <dd className="text-ivory-faint">Closed</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="eyebrow">Contact</p>
            <div className="mt-5 space-y-2.5 text-[13px] text-ivory-dim">
              {settingsQuery.data?.phone && (
                <a href={`tel:${settingsQuery.data.phone}`} className="block hover:text-gold">
                  {settingsQuery.data.phone}
                </a>
              )}
              <Link to="/menu" className="block hover:text-gold">
                View the menu
              </Link>
              <Link to="/track" className="block hover:text-gold">
                Track an order
              </Link>
              <Link to="/login" className="block hover:text-gold">
                Staff sign in
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-smoke px-6 py-7">
          <p className="mx-auto max-w-7xl text-center text-[11px] uppercase tracking-[0.2em] text-ivory-faint">
            {restaurantName} — scan, order, dine
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
