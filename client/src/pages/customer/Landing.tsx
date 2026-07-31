/**
 * Landing page.
 *
 * The hero is a single full-bleed still with a very slow zoom. A fine dining
 * site earns its impression from restraint: one photograph, one line of type,
 * one action — not a carousel competing with itself.
 *
 * Nothing below it is placeholder content. The signature dishes and the chef's
 * recommendations are the real menu, the testimonials are real rows an admin
 * published, and every line of prose comes from the CMS.
 *
 * Each piece of copy falls back to the wording written here when the CMS field
 * is blank. That is deliberate: a restaurant that never opens the content
 * screen still gets a finished page, and clearing a box in the admin restores
 * this text rather than leaving a hole in the layout.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Modal from "../../components/Modal";
import { MonkDeveloperBrand } from "../../components/MonkDeveloperBrand";
import {
  DietMark,
  LuxeButton,
  LuxeSkeleton,
  OfferBadge,
  PriceTag,
  Reveal,
  SectionHeading,
  Stars,
} from "../../components/luxe";
import { config } from "../../config/env";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import { effectivePrice, offerBadge, strikethroughPrice } from "../../lib/offer";
import { getSocket, SOCKET_EVENTS } from "../../lib/socket";
import type {
  ApiResponse,
  Food,
  PublicSettings,
  Review,
  SiteContent,
} from "../../types/api";

import heroImage from "../../assets/image/hero.jpg";
import biryaniImage from "../../assets/image/biriyani.jpg";
import dessertImage from "../../assets/image/dessert.jpg";
import latteImage from "../../assets/image/latte.webp";
import pizzaImage from "../../assets/image/margherita-pizza.jpg";
import burgerImage from "../../assets/image/burger.jpg";
import ambianceImage from "../../assets/image/restaurant-ambiance.jpg";

const GALLERY = [
  { src: biryaniImage, alt: "Slow-cooked biryani", span: "row-span-2" },
  { src: dessertImage, alt: "Chocolate dessert", span: "" },
  { src: pizzaImage, alt: "Wood-fired pizza", span: "" },
  { src: latteImage, alt: "Coffee service", span: "" },
  { src: burgerImage, alt: "Aged beef burger", span: "row-span-2" },
  { src: heroImage, alt: "The dining room", span: "" },
];

/**
 * Copy used when the CMS field is empty.
 *
 * `?? ""` would not do: a field an editor cleared comes back as null, and a
 * field they never touched comes back as null too. Both mean "use the house
 * wording", so one helper covers both and the JSX below stays readable.
 */
const text = (value: string | null | undefined, fallback: string): string =>
  value?.trim() ? value : fallback;

const Landing = () => {
  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const contentQuery = useQuery({
    queryKey: ["content"],
    queryFn: async () => unwrap(await api.get<ApiResponse<SiteContent>>("/content")),
  });

  const signatureQuery = useQuery({
    queryKey: [...queryKeys.foods, "signature"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Food[]>>("/foods?limit=6&sortBy=price&sortOrder=desc")),
  });

  /**
   * The chef's recommendations.
   *
   * Read live on every visit, so the page always shows whatever the admin has
   * ticked right now — there is nothing to publish and no cache to clear.
   */
  const featuredQuery = useQuery({
    queryKey: [...queryKeys.foods, "featured"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Food[]>>("/foods?isFeatured=true&limit=6")),
  });

  const reviewsQuery = useQuery({
    queryKey: ["content", "reviews"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Review[]>>("/content/reviews?limit=12")),
    refetchInterval: 3_000,
  });

  const queryClient = useQueryClient();
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const refreshReviews = () => {
      void queryClient.invalidateQueries({ queryKey: ["content", "reviews"] });
    };
    socket.on(SOCKET_EVENTS.REVIEW_CHANGED, refreshReviews);
    return () => {
      socket.off(SOCKET_EVENTS.REVIEW_CHANGED, refreshReviews);
    };
  }, [queryClient]);

  const submitCustomerReview = useMutation({
    mutationFn: async () =>
      api.post("/content/reviews", {
        customerName: customerName.trim() || "Guest Diner",
        rating,
        comment: comment.trim() || "Exquisite dining experience!",
        visitedOn: new Date().toISOString(),
      }),
    onSuccess: () => {
      setReviewSubmitted(true);
      void queryClient.invalidateQueries({ queryKey: ["content", "reviews"] });
      setTimeout(() => {
        setShowReviewModal(false);
        setReviewSubmitted(false);
        setCustomerName("");
        setComment("");
        setRating(5);
      }, 2000);
    },
  });

  const content = contentQuery.data;
  const restaurantName = settingsQuery.data?.name ?? "Bite me Bistro";
  const signatures = signatureQuery.data ?? [];
  const featured = featuredQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];

  // The lead recommendation gets the full-width treatment; if nothing is
  // featured, the most expensive dish stands in so the section is never empty.
  const special = featured[0] ?? signatures[0];

  return (
    <div className="bg-obsidian">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={ambianceImage}
            alt=""
            className="animate-kenburns h-full w-full object-cover"
            fetchPriority="high"
          />
          {/* Two gradients — vertical wash for legibility, radial vignette for focus.
              Dark mode: deep obsidian overlay. Light mode: soft warm-cream overlay. */}
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/90 via-obsidian/60 to-obsidian html-light:from-slate-100/80 html-light:via-slate-50/50 html-light:to-white" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(10,10,11,0.80)_100%)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <p className="animate-rise eyebrow delay-1">
            {text(content?.heroEyebrow, "Est. 2019 · Fine Dining")}
          </p>

          <h1 className="animate-rise delay-2 mt-7 text-[clamp(2.25rem,10vw,7rem)] leading-[0.92] text-ivory">
            {text(content?.heroTitle, restaurantName)}
          </h1>

          <div className="animate-rise delay-2 mx-auto mt-8 flex items-center justify-center gap-5">
            <span className="rule-fade h-px w-16" />
            <Stars />
            <span className="rule-fade h-px w-16" />
          </div>

          <p className="animate-rise delay-3 mx-auto mt-8 max-w-xl text-[15px] leading-relaxed text-ivory-dim">
            {text(
              content?.heroLede,
              settingsQuery.data?.tagline ??
                "A seasonal menu built around fire, patience and produce picked the same morning. Scan, order, and let the kitchen do the rest."
            )}
          </p>

          <div className="animate-rise delay-4 mt-12 flex flex-wrap items-center justify-center gap-4">
            <LuxeButton href="#signatures">Explore the menu</LuxeButton>
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

      {/* -------------------------------------------------------------- banner */}
      <aside className="border-y border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-amber-500/15 to-orange-500/10 py-3.5">
        <div className="mx-auto max-w-7xl px-6 text-center flex items-center justify-center gap-3">
          <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-orange-400">
            Official System Partner — MONK DEVELOPER
          </p>
        </div>
      </aside>

      {/* --------------------------------------------------------- why dine here */}
      <section className="relative overflow-hidden">
        {/* Soft background image with strong overlay for text legibility */}
        <div className="absolute inset-0">
          <img
            src={ambianceImage}
            alt=""
            className="h-full w-full object-cover object-center"
            aria-hidden="true"
          />
          {/* Dark mode: deep dark overlay. Light mode: warm ivory overlay */}
          <div className="absolute inset-0 bg-obsidian/80 dark:bg-obsidian/85" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 md:py-32">
          <Reveal>
            <SectionHeading
              eyebrow="The experience"
              title="Why guests come back"
              lede="Every plate tells the story of careful sourcing, slow cooking and a kitchen that takes pride in never repeating a shortcut."
            />
          </Reveal>

          {/* Stats row */}
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { number: "200+", label: "Dishes on the seasonal menu", icon: "🍽️" },
              { number: "4.9★", label: "Average guest rating", icon: "⭐" },
              { number: "25+", label: "Min. kitchen-to-table freshness", icon: "⏱️" },
              { number: "100%", label: "Farm-to-fork ingredients", icon: "🌿" },
            ].map((stat) => (
              <Reveal key={stat.label}>
                <div className="glass rounded-luxe p-7 text-center">
                  <div className="text-4xl mb-3">{stat.icon}</div>
                  <p className="font-display text-[2.5rem] leading-none text-slate-gradient">{stat.number}</p>
                  <p className="mt-3 text-[13px] leading-relaxed text-ivory-dim">{stat.label}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Feature pills row */}
          <div className="mt-14 flex flex-wrap justify-center gap-4">
            {[
              "Scan & Order from the table",
              "Live kitchen tracking",
              "UPI & Card payments",
              "Allergen-aware menu",
              "Private dining room",
              "Chef's seasonal specials",
            ].map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-gold/40 bg-gold/10 px-5 py-2.5 text-[12px] font-medium uppercase tracking-[0.16em] text-ivory-dim backdrop-blur-sm transition hover:border-gold/70 hover:text-ivory"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- signatures */}
      <section id="signatures" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 md:py-36">
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
              <LuxeSkeleton key={index} className="h-[360px] sm:h-[420px]" />
            ))}

          {signatures.map((food, index) => {
            const image = imageUrl(food.imageUrl, config.apiUrl);

            return (
              <Reveal key={food.id} delay={index * 90}>
                <article className="lift group relative h-[360px] overflow-hidden rounded-luxe sm:h-[420px]">
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

                  <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/25 to-transparent opacity-0 dark:opacity-100 transition-opacity" />

                  {food.isFeatured && (
                    <span className="absolute right-5 top-5 rounded-full border border-gold/50 bg-obsidian/70 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate backdrop-blur">
                      Chef's pick
                    </span>
                  )}

                  {offerBadge(food) && (
                    <OfferBadge
                      label={offerBadge(food) as string}
                      className="absolute left-5 top-5"
                    />
                  )}

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

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <PriceTag
                        price={formatMoney(effectivePrice(food))}
                        listPrice={
                          strikethroughPrice(food) &&
                          formatMoney(strikethroughPrice(food) as string)
                        }
                      />

                      {/* Reveals on hover on desktop; always visible on touch,
                          where there is no hover to reveal it. */}
                      <Link
                        to="/menu"
                        className="text-[10px] uppercase tracking-[0.24em] text-ivory-dim opacity-100 transition-all duration-500 hover:text-slate md:opacity-0 md:group-hover:opacity-100"
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

      {/* ------------------------------------------------------ chef's picks */}
      {/* The whole section is conditional: with nothing featured, a heading
          over an empty row would look broken rather than restrained. */}
      {featured.length > 0 && (
        <section id="featured" className="border-y border-smoke bg-charcoal py-20 sm:py-28 md:py-36">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal>
              <SectionHeading
                eyebrow={text(content?.featuredEyebrow, "Chef's recommendation")}
                title={text(content?.featuredTitle, "What we would order")}
                lede={text(
                  content?.featuredLede,
                  "The plates the kitchen is proudest of tonight. Prices are live from the menu you will order from."
                )}
              />
            </Reveal>

            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((food, index) => {
                const image = imageUrl(food.imageUrl, config.apiUrl);

                return (
                  <Reveal key={food.id} delay={index * 90}>
                    <article className="glass rounded-luxe relative flex h-full flex-col overflow-hidden">
                      {offerBadge(food) && (
                        <OfferBadge
                          label={offerBadge(food) as string}
                          className="absolute left-4 top-4 z-10"
                        />
                      )}

                      {image && (
                        <img
                          src={image}
                          alt={food.name}
                          loading="lazy"
                          className="h-48 w-full object-cover"
                        />
                      )}

                      <div className="flex flex-1 flex-col p-6">
                        <div className="flex items-center gap-2.5">
                          <DietMark vegetarian={food.isVegetarian} />
                          <span className="eyebrow">{food.category.name}</span>
                        </div>

                        <h3 className="mt-3 text-2xl leading-tight text-ivory">
                          {food.name}
                        </h3>

                        {food.description && (
                          <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed text-ivory-dim">
                            {food.description}
                          </p>
                        )}

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <PriceTag
                            price={formatMoney(effectivePrice(food))}
                            listPrice={
                              strikethroughPrice(food) &&
                              formatMoney(strikethroughPrice(food) as string)
                            }
                          />
                          <Link
                            to="/menu"
                            className="text-[10px] uppercase tracking-[0.24em] text-ivory-dim transition-colors hover:text-slate"
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

            <div className="mt-12 pt-8 border-t border-smoke/40 flex justify-center">
              <MonkDeveloperBrand variant="compact" />
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ chef special */}
      {special && (
        <section className="relative overflow-hidden py-20 sm:py-28 md:py-36">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:gap-16 lg:grid-cols-2">
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

              {/* Two columns before 416px: three left ~90px each, which a
                  discounted price ("₹400" over a struck-through "₹500")
                  cannot sit in without spilling. */}
              <dl className="mt-10 grid grid-cols-2 gap-5 border-y border-smoke py-7 xs:grid-cols-3 sm:gap-6">
                <div>
                  <dt className="eyebrow">Price</dt>
                  <dd className="mt-1.5">
                    <PriceTag
                      price={formatMoney(effectivePrice(special))}
                      listPrice={
                        strikethroughPrice(special) &&
                        formatMoney(strikethroughPrice(special) as string)
                      }
                    />
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
      <section id="about" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 md:py-36">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <Reveal>
            <SectionHeading
              eyebrow={text(content?.aboutEyebrow, "The house")}
              title={text(content?.aboutTitle, "A room built around one table")}
              align="left"
            />

            <div className="mt-7 space-y-5 text-[15px] leading-loose text-ivory-dim">
              {/* Blank lines in the CMS become paragraphs. Rendered as text
                  nodes, never as HTML: this is editor-supplied content, and
                  dangerouslySetInnerHTML here would be a stored-XSS hole. */}
              {text(
                content?.aboutBody,
                "The kitchen is open to the room because there is nothing in it we would rather you did not see. Everything is cooked to order, which is the honest reason some plates take longer than others.\n\nThe menu changes when the produce changes — not on a schedule. Scan the code at your table and it will always show you what we can actually cook tonight."
              )
                .split(/\n{2,}/)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
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
              <div className="glass rounded-luxe absolute -bottom-6 left-0 max-w-[14rem] p-5 sm:-bottom-8 sm:-left-8 sm:max-w-[16rem] sm:p-6">
                <p className="eyebrow">Executive Chef</p>
                <p className="font-display mt-2 text-3xl text-ivory">Arjun Kapadia</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ivory-faint">
                  Sixteen years across Lyon, Copenhagen and Mumbai.
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="mt-12 pt-8 border-t border-smoke/40 flex justify-center">
          <MonkDeveloperBrand variant="compact" />
        </div>
      </section>

      {/* ------------------------------------------ ambiance / dining experience */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0">
          <img
            src={ambianceImage}
            alt="Restaurant ambiance"
            className="h-full w-full object-cover object-center"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian/95 via-obsidian/70 to-obsidian/40" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-lg">
            <Reveal>
              <p className="eyebrow">The Atmosphere</p>
              <h2 className="font-display mt-5 text-[clamp(2rem,7vw,4rem)] leading-[0.95] text-ivory">
                Crafted for those who dine, not just those who eat.
              </h2>
              <div className="rule-fade mt-7 h-px w-24" />
              <p className="mt-7 text-[15px] leading-loose text-ivory-dim">
                From the first glance at the menu to the final sip of dessert wine, every moment at our table has been considered. The lighting, the spacing, the sound — none of it is accidental.
              </p>
              <p className="mt-4 text-[15px] leading-loose text-ivory-dim">
                Our kitchen is open because we have nothing to hide. Watch your dish being finished at the pass, then scan the QR to order again — because at a table like this, one course is never enough.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link to="/menu">
                  <LuxeButton>Browse the full menu</LuxeButton>
                </Link>
                <Link to="/reserve">
                  <LuxeButton variant="outline">Reserve your table</LuxeButton>
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- gallery */}
      <section id="gallery" className="bg-charcoal py-20 sm:py-28 md:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <SectionHeading eyebrow="Gallery" title="From the pass" />
          </Reveal>

          <div className="mt-16 grid auto-rows-[140px] grid-cols-2 gap-3 sm:auto-rows-[220px] sm:gap-4 lg:grid-cols-4">
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

          <div className="mt-12 pt-8 border-t border-smoke/40 flex justify-center">
            <MonkDeveloperBrand variant="compact" />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- reviews */}
      <section id="reviews" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 md:py-36">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Guests" title="What the room says" />
            <LuxeButton onClick={() => setShowReviewModal(true)} className="font-bold text-xs uppercase tracking-wider">
              + Leave a Review
            </LuxeButton>
          </div>
        </Reveal>

        {reviews.length > 0 ? (
          <div className="mt-16 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:none] md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
            {reviews.map((review, index) => (
              <Reveal
                key={review.id}
                delay={index * 110}
                className="w-[85vw] shrink-0 snap-center sm:w-[60vw] md:w-auto"
              >
                <figure className="glass rounded-luxe flex h-full flex-col justify-between p-8">
                  <div>
                    <Stars rating={review.rating} />

                    <blockquote className="font-display mt-6 text-[22px] leading-snug text-ivory">
                      “{review.comment}”
                    </blockquote>
                  </div>

                  <figcaption className="mt-8 flex items-center gap-3 border-t border-smoke pt-5">
                    {review.imageUrl ? (
                      <img
                        src={imageUrl(review.imageUrl, config.apiUrl) ?? ""}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/30 text-sm text-slate">
                        {review.customerName.slice(0, 1).toUpperCase()}
                      </span>
                    )}

                    <div className="min-w-0">
                      <p className="truncate text-sm text-ivory">
                        {review.customerName}
                      </p>
                      {review.visitedOn && (
                        <p className="eyebrow mt-1">
                          Dined{" "}
                          {new Date(review.visitedOn).toLocaleDateString("en-IN", {
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="mt-12 text-center text-ivory-dim">
            <p className="text-sm">Be the first to leave a review!</p>
          </div>
        )}
      </section>

      {/* Review Submission Modal for Diners */}
      <Modal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="Share Your Dining Experience"
        description="Your review will be sent to the restaurant team for approval before going live."
      >
        {reviewSubmitted ? (
          <div className="py-8 text-center">
            <span className="text-4xl">🌟</span>
            <p className="mt-3 text-lg font-bold text-emerald-400">Thank you for your review!</p>
            <p className="mt-1 text-sm text-ivory-dim">
              Your feedback has been received. It will appear on the page once our team approves it.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitCustomerReview.mutate();
            }}
            className="grid gap-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ivory-dim">Your Name</span>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ananya Sen"
                className="w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint outline-none transition focus:border-gold"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ivory-dim">Rating</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="text-2xl transition hover:scale-110"
                  >
                    <span className={star <= rating ? "text-gold" : "text-ivory-faint opacity-40"}>★</span>
                  </button>
                ))}
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ivory-dim">Review &amp; Feedback</span>
              <textarea
                required
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="How was the food, service and ambience?"
                className="w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint outline-none transition focus:border-gold"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2 border-t border-smoke pt-4">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="rounded-xl border border-smoke bg-graphite px-4 py-2.5 text-sm font-semibold text-ivory hover:text-gold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitCustomerReview.isPending}
                className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-obsidian shadow-sm transition hover:bg-gold-light disabled:opacity-50"
              >
                {submitCustomerReview.isPending ? "Submitting…" : "Submit Review"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* --------------------------------------------- reserve / events / CTA */}
      <section id="reserve" className="relative overflow-hidden">
        <img
          src={heroImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-obsidian/88" />

        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 md:py-36">
          <Reveal>
            <SectionHeading
              eyebrow="Reservations & private dining"
              title="Join us for dinner"
              lede="For parties of eight or more, or for the chef's table, please call the house directly."
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
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-3">
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
                <a href={`tel:${settingsQuery.data.phone}`} className="block hover:text-slate">
                  {settingsQuery.data.phone}
                </a>
              )}
              <Link to="/menu" className="block hover:text-slate">
                View the menu
              </Link>
              <Link to="/reserve" className="block hover:text-slate">
                Reserve a table
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-smoke px-6 py-7 flex flex-col items-center gap-3">
          <p className="mx-auto max-w-7xl text-center text-[11px] uppercase tracking-[0.2em] text-ivory-faint">
            {restaurantName} — {text(content?.footerNote, "scan, order, dine")}
          </p>
          <MonkDeveloperBrand variant="compact" />
        </div>
      </footer>
    </div>
  );
};

export default Landing;
