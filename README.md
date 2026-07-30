# Restaurant QR Ordering & Management System

A diner scans the QR code on their table, orders without creating an account,
and watches the kitchen cook it in real time. Staff, chef and admin each see
the same order from their own angle, the moment it is placed.

**Stack** — React 19 · TypeScript · Vite · Tailwind · Express 5 · Prisma 7 ·
PostgreSQL · Socket.io · JWT

---

## Run it locally

Requires Node 20+, Docker Desktop and Git.

```bash
# database
cd server
cp .env.example .env          # then fill in the two JWT secrets
docker compose up -d

# backend
npm install
npm run db:migrate            # create the tables
npm run seed                  # roles, permissions, admin, settings
npm run seed:demo             # sample menu, 8 tables with QR, demo staff
npm run dev                   # http://localhost:5000

# frontend, in a second terminal
cd ../client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Generate the JWT secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`npm run seed:demo` prints table links like `/t/<token>` — open one to start as
a diner. `npm run db:studio` in `server/` opens a visual database browser.

### Demo accounts

`seed:demo` creates three staff accounts, all with password `DemoPassword2026`:

| Email | Role | Lands on |
|---|---|---|
| `chef@restaurant.local` | KITCHEN | Kitchen Display |
| `manager@restaurant.local` | ADMIN | Dashboard |
| `waiter@restaurant.local` | STAFF | Orders |

The super admin is whatever you set as `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

---

## The five apps

| Who | Route | What they do |
|---|---|---|
| Customer | `/t/:token` | Scan, see the table number, browse, order, track live |
| Chef | `/kitchen` | Four-column display, one tap per status, tickets age visibly |
| Staff | `/staff` | Advance orders, mark paid, print invoices, assist at the table |
| Admin | `/admin` | Revenue, live counts, highest sellers, menu, tables, QR, welcome-page content |
| Super admin | `/admin/users` … | Staff accounts, roles, permissions, audit trail |

Open four browser tabs and place an order in the first — the other three update
without a refresh.

---

## Architecture

```
routes → validate → authenticate → authorize → controller → service → prisma
```

Controllers stay thin: read the request, call a service, shape the response.
Services hold the rules and never touch `req` or `res`, which is what makes
them reusable from a socket handler or a script.

**Backend** — 92 endpoints, 19 tables, 42 permissions

```
server/src
├── config/        env (Zod-validated), prisma client, permission catalogue
├── middleware/    auth, RBAC, validation, upload, audit, errors, security
├── services/      business logic — no HTTP
├── controllers/   HTTP in, HTTP out
├── routes/        middleware chains that read as a security spec
├── socket/        Socket.io server, rooms, emissions
└── utils/         money, slug, storage, jwt, password, qrcode, pagination
```

**Frontend**

```
client/src
├── lib/           axios client with refresh-on-401, socket, formatting
├── context/       auth session, cart + table session
├── hooks/         Socket.io → React Query invalidation
├── pages/customer QR landing, menu, cart, tracking
└── pages/staff    kitchen, orders, dashboard, menu, tables, users, roles, audit
```

---

## Decisions worth knowing

**Single-tenant dedicated instance model (#36).** `RestaurantSettings` is an intentional singleton (`SETTINGS_ID = "singleton"`). The system is architected as a dedicated single-tenant instance per venue. This guarantees 100% data isolation, zero noisy-neighbor performance impact during peak dining hours, consecutive GST tax invoice numbering per venue, and simplified compliance without cross-tenant query leaks. New venues are provisioned in minutes via automated Render blueprint deployment ([`render.yaml`](render.yaml)).

**Money never touches a float.** `parseFloat("19.99") * 100` is
`1998.9999999999998`. Totals are computed in integer paise and stored as
`Decimal(10,2)`.

**Prices come from the database, always.** The client sends food ids and
quantities — never a price or a total. A tampered cart changes nothing.

**An offer price is derived, never posted.** A dish carries its list price and
a discount (a percentage or an amount); the server computes what it sells for
and stores that. The admin form previews the same figure while it is typed,
using the same rounding, so what the manager sees, what the menu advertises
and what `POST /orders` bills are one number arrived at three times. Accepting
an `offerPrice` from a client would be the "change the price in DevTools"
vulnerability wearing a discount.

**Order items snapshot their price and name.** Changing the menu tomorrow must
not rewrite what a customer was charged last week.

**Order numbers come from a Postgres sequence.** `COUNT(*) + 1` and
`MAX() + 1` both race under concurrent orders and eventually collide.

**An order number is an identifier, never a credential.** Because it comes
from a sequence, anyone can walk it. So every order also carries a
`trackingToken` — 32 random bytes, handed to the diner exactly once in the
response to placing the order. The public tracking page, the invoice and the
online payment flow are all keyed on the token; the order number is only for
reading aloud. Keying any of them on the number would have let a stranger
count upwards and read other people's bills.

**The welcome page is data, not markup.** Its copy lives in a single-row
`site_content` table, its recommendations are whichever dishes are flagged
`isFeatured`, and its testimonials are rows an admin publishes. Every content
field is nullable and the page falls back to built-in wording, so a restaurant
that never opens the content screen still gets a finished page — and clearing
a field restores that wording rather than leaving a hole.

**An invoice restates what was charged.** Every figure on it comes from the
order's own stored columns and its line-item snapshots, never from the live
menu or the current tax rate — which is what lets a reprint years later
reproduce the original bill after the dish has been renamed and repriced.

**Routes name capabilities, not roles.** `authorize("order:update")`, never
`authorize("ADMIN")`. A new role is a data change in the admin UI — no code,
no redeploy.

**Access tokens live in memory, not localStorage.** Any script on the page can
read localStorage, so one XSS bug would leak the session. The refresh token is
an httpOnly cookie the browser will not expose to JavaScript.

**Refresh tokens rotate.** Each refresh revokes the token that was used, so a
stolen one dies the moment the real user refreshes.

**Uploads are verified by their bytes.** The filename and `Content-Type` are
both attacker-controlled; only the file's magic bytes prove what it is.

**Socket.io re-checks authentication at the handshake.** Express middleware
does not run for WebSocket connections — without that check, any anonymous
client could receive every order in the restaurant.

---

## Scripts

```bash
# server/
npm run dev          npm run build        npm start
npm run typecheck    npm run test         npm run test:watch
npm run docs         npm run seed         npm run seed:demo
npm run db:migrate   npm run db:studio    npm run db:generate

# client/
npm run dev          npm run build        npm run lint
npm run typecheck    npm run test         npm run test:watch
```

---

## API documentation

With the server running:

| | |
|---|---|
| **http://localhost:5000/api/docs** | Swagger UI — browse and call every endpoint |
| **http://localhost:5000/api/docs/openapi.json** | the raw OpenAPI 3.1 document |
| [`server/openapi.json`](server/openapi.json) | the same document, committed — import it into Postman or generate a client |

92 operations across 11 tags. Every one states the permission it needs, so the
docs answer "who can call this?" without opening the route files.

Request shapes are **generated from the Zod schemas the server validates with**,
so they cannot drift from the code — and a test walks the real Express routers
to assert every registered route is documented and nothing is documented that
does not exist. Adding an endpoint without describing it fails the build.

```bash
cd server && npm run docs     # regenerate server/openapi.json
```

Set `API_DOCS=false` to withhold the docs. It changes nothing else: every
protected route is behind a token and a permission either way.

---

## Tests

```bash
cd server && npm test     # money, offers, trading-day calendar, error mapping, state machine
cd client && npm test     # the cart quote, offer pricing, staff landing routes
```

Both suites are pure logic and need no database, so they run in about a second
and cannot fail for reasons unrelated to the code. They cover the places where
being subtly wrong is expensive and invisible: money arithmetic, where a float
loses a paisa; the trading-day boundary, where a timezone shifts a day's takings
onto the wrong day; and the order state machine, where an illegal transition
would let a settled bill be reopened.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs both on every push,
alongside the type-check, the lint and a budget on the JavaScript a diner has to
download before they can see the menu.

---

## Deploying

See [DEPLOY.md](DEPLOY.md) — Render for the API and database, Vercel for the
client, roughly 20 minutes.
