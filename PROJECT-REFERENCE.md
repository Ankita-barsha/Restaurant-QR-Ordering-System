# Project Reference

What is used where, and every endpoint the API serves.

For *why* the system is built this way, read [README.md](README.md). This file
is the flat reference: the technology per part, and the API surface as a list.

---

## 1. Technology by part

### 1.1 Frontend — `client/`

| Concern | What is used | Where |
| --- | --- | --- |
| Language | TypeScript 6 | `client/src/**` |
| UI library | React 19 | `client/src/**` |
| Build tool | Vite 8 (Rolldown), with React and Tailwind plugins and vendor chunk splitting for caching | `client/vite.config.ts` |
| Routing | React Router 7 | `client/src/App.tsx` |
| Server state | TanStack Query 5 | `client/src/hooks/useLiveOrders.ts`, every page |
| Client state | React Context — auth, cart, favourites | `client/src/context/` |
| HTTP | Axios, one configured instance with the refresh interceptor | `client/src/lib/api.ts` |
| Realtime | Socket.IO client 4 | `client/src/lib/socket.ts` |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) | `client/src/index.css`, `App.css` |
| Icons | `lucide-react` | components |
| Fonts | Fontsource — Cormorant Garamond, Jost | `client/src/main.tsx` |
| Validation | Zod 4 — validates env vars at boot | `client/src/config/env.ts` |
| Tests | Vitest 4 | `client/src/lib/*.test.ts` |
| Linting | ESLint 10 + typescript-eslint, react-hooks, react-refresh | `client/eslint.config.js` |

**Frontend structure**

| Folder | Holds |
| --- | --- |
| `pages/customer/` | Diner screens: `ScanTable`, `Landing`, `CustomerMenu`, `CustomerCart`, `TrackOrder`, `Reserve` |
| `pages/staff/` | Staff screens: `Login`, `KitchenDisplay`, `StaffOrders`, `WaiterServe`, and the ten `Admin*` screens |
| `components/` | Shared pieces: `Navbar`, `Modal`, `DishSheet`, `ImagePicker`, `NotificationBell`, `ProtectedRoute`, `DemoCheckout`, the `luxe`/`ui` primitives |
| `layouts/` | `MainLayout` (customer chrome); `StaffLayout` sits in `components/` |
| `context/` | `AuthContext`, `CartContext`, `FavouritesContext`. Each is split in two — the `.tsx` file exports only components, the `.ts` file the context, hook and types, so React Fast Refresh keeps working |
| `hooks/` | `useLiveOrders` — the socket subscriptions and their query-cache updates |
| `lib/` | `api` (Axios), `socket`, `money` (integer paise arithmetic), `format`, `homeRoute` |
| `types/` | `api.ts` — the response types shared with the server's shapes |

### 1.2 Backend — `server/`

| Concern | What is used | Where |
| --- | --- | --- |
| Runtime | Node.js 22+, ES modules | — |
| Language | TypeScript 7 | `server/src/**` |
| Framework | Express 5 | `server/src/app.ts` |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter | `server/prisma/schema.prisma`, `server/src/config/prisma.ts` |
| Database | PostgreSQL (`pg` 8) | — |
| Auth | JWT access + refresh tokens (`jsonwebtoken`), refresh tokens stored and revocable | `server/src/utils/jwt.ts`, `services/auth.service.ts` |
| Passwords | bcrypt | `server/src/utils/password.ts` |
| Authorisation | Role → permission table, checked per route | `server/src/middleware/authorize.ts`, `config/permissions.ts` |
| Validation | Zod 4, applied as middleware to body / query / params | `server/src/validations/`, `middleware/validate.ts` |
| Realtime | Socket.IO 4 | `server/src/socket/` |
| Security | Helmet, CORS, `express-rate-limit` (general + public-write + public-lookup limiters) | `server/src/middleware/security.ts` |
| File upload | Multer 2, disk storage | `server/src/middleware/upload.ts`, `utils/storage.ts` |
| QR codes | `qrcode` | `server/src/utils/qrcode.ts` |
| Compression | `compression` | `server/src/app.ts` |
| Cookies | `cookie-parser` — the refresh token is httpOnly | `server/src/app.ts` |
| API docs | Hand-written OpenAPI 3.1 built from the Zod schemas, served by `swagger-ui-dist`, linted by `@redocly/cli` | `server/src/docs/` |
| Config | Zod-validated environment, `dotenv` | `server/src/config/env.ts` |
| Tests | Vitest 4 | `server/src/**/*.test.ts` |

**Backend structure** — a request travels `routes → middleware → controller → service → Prisma`.

| Folder | Holds |
| --- | --- |
| `routes/` | URL shape and the middleware chain per endpoint. Nine routers, mounted in `routes/index.ts` |
| `controllers/` | HTTP in, HTTP out. No business rules |
| `services/` | All business logic and every database call — 13 services |
| `middleware/` | `authenticate`, `authorize`, `validate`, `audit`, `upload`, `security`, `errorHandler` |
| `validations/` | Zod schemas. Also the single source the OpenAPI request shapes are generated from |
| `utils/` | `money` (integer paise), `tradingDay` (timezone-correct day boundaries), `jwt`, `password`, `AppError`, `prismaError`, `pagination`, `qrcode`, `slug`, `storage`, `paymentProvider` |
| `socket/` | `index.ts` (rooms, auth on connect), `events.ts` (what is emitted, and the trimmed projection sent to diners) |
| `docs/` | `openapi.ts` (the document), `schema.ts` (Zod → JSON Schema), `router.ts` (Swagger UI), `write.ts` (`npm run docs`) |
| `config/` | `env.ts`, `permissions.ts`, `prisma.ts` |

### 1.3 Database — `server/prisma/`

PostgreSQL, 17 models and 8 enums.

| Area | Models |
| --- | --- |
| People & access | `User`, `RefreshToken`, `Role`, `Permission`, `RolePermission` |
| Menu | `Category`, `Food` |
| Service | `Table`, `Customer`, `Order`, `OrderItem`, `Reservation` |
| Money | `Payment` |
| Operations | `Notification`, `NotificationRead`, `AuditLog`, `RestaurantSettings` |

Enums: `OrderStatus`, `OrderType`, `PaymentStatus`, `PaymentMethod`,
`PaymentTxnStatus`, `TableStatus`, `ReservationStatus`, `NotificationType`.

### 1.4 Realtime events — Socket.IO

| Event | Direction | Purpose |
| --- | --- | --- |
| `order:subscribe` / `order:unsubscribe` | client → server | Join or leave one order's room, keyed on the tracking token |
| `order:created` | server → client | A new order reaches the kitchen display |
| `order:updated` | server → client | Any change to an order |
| `order:statusChanged` | server → client | A status transition |
| `order:cancelled` | server → client | An order was cancelled |
| `notification:new` | server → client | A new item for the staff bell |

Staff rooms receive the full order row. The customer room receives a
whitelisted projection, so a field added later is invisible to diners by
default.

### 1.5 Tooling and delivery

| Concern | What is used | Where |
| --- | --- | --- |
| CI | GitHub Actions — two parallel jobs (Server, Client) on `ubuntu-latest` | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| CI checks | `npm ci`, prisma generate, type-check, tests, OpenAPI freshness diff, redocly lint, build, client bundle budget (520 kB) | same |
| Hosting | Render (blueprint) | [render.yaml](render.yaml), [DEPLOY.md](DEPLOY.md) |
| Version control | Git, branch `ankita` | — |

---

## 2. API list

**Base URL:** `/api` — e.g. `http://localhost:5000/api/orders`.

**82 operations across 62 paths.** Interactive docs run at `/api/docs`;
the machine-readable document is [server/openapi.json](server/openapi.json).

**Access column:** *Public* needs no login. *Signed in* needs a valid access
token. A `permission:name` needs that permission granted to the caller's role.

### Meta (2)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/health` | Liveness probe | Public |
| `GET` | `/settings` | Restaurant name, currency and charges | Public |

### Auth (5)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Sign in | Public |
| `POST` | `/auth/refresh` | Mint a new access token | Signed in |
| `POST` | `/auth/logout` | Sign out of this session | Signed in |
| `POST` | `/auth/logout-all` | Sign out everywhere | Signed in |
| `GET` | `/auth/me` | The signed-in staff member | Signed in |

### Menu (13)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/categories` | List categories | Public |
| `POST` | `/categories` | Create a category | `category:create` |
| `GET` | `/categories/slug/{slug}` | Fetch a category by slug | Public |
| `GET` | `/categories/{id}` | Fetch a category | `category:read` |
| `PATCH` | `/categories/{id}` | Edit a category | `category:update` |
| `DELETE` | `/categories/{id}` | Delete a category | `category:delete` |
| `GET` | `/foods` | Browse the menu | Public |
| `POST` | `/foods` | Add a dish | `food:create` |
| `GET` | `/foods/slug/{slug}` | Fetch a dish by slug | Public |
| `GET` | `/foods/{id}` | Fetch a dish | `food:read` |
| `PATCH` | `/foods/{id}` | Edit a dish | `food:update` |
| `DELETE` | `/foods/{id}` | Delete a dish | `food:delete` |
| `PATCH` | `/foods/{id}/availability` | Mark a dish sold out or back on | `food:read` |

### Orders (9)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/orders` | List orders | `order:read` |
| `POST` | `/orders` | Place an order | Public |
| `GET` | `/orders/track/{token}` | Track an order | Public |
| `GET` | `/orders/kitchen` | The Kitchen Display queue | `kitchen:access` |
| `GET` | `/orders/{id}` | Fetch an order | `order:read` |
| `POST` | `/orders/{id}/items` | Add to a running tab | `order:create` |
| `PATCH` | `/orders/{id}/status` | Advance an order | `order:updateStatus` |
| `POST` | `/orders/{id}/serve` | Serve, after verifying the pickup code | `order:updateStatus` |
| `POST` | `/orders/{id}/cancel` | Cancel an order | `order:cancel` |

`POST /orders` returns a `trackingToken` **once**. Tracking, the pickup code
and the payment flow are all keyed on that token, never on the order number —
order numbers come from a sequence and can be guessed by counting.

### Payments (7)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `PATCH` | `/orders/{id}/payment` | Settle an order at the table | `order:updateStatus` |
| `POST` | `/payments/online` | Start an online payment | Public |
| `POST` | `/payments/{id}/confirm` | Confirm an online payment | Public |
| `GET` | `/payments/{id}/receipt` | Fetch a receipt | Public |
| `POST` | `/payments/cash` | Record cash taken at the table | `order:updateStatus` |
| `POST` | `/payments/{id}/refund` | Refund a payment | `order:cancel` |
| `GET` | `/payments` | The payment ledger | `report:view` |

The online provider is a **demo gateway** — responses carry `isDemo: true` and
the checkout screen shows a banner. It sits behind a provider interface, so a
real gateway replaces it without touching the flow.

### Reservations (8)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/reservations` | List bookings | `reservation:read` |
| `POST` | `/reservations` | Take a booking | Public |
| `GET` | `/reservations/availability` | Seats free at a time | Public |
| `GET` | `/reservations/lookup/{reference}` | Look up a booking | Public |
| `POST` | `/reservations/lookup/{reference}/cancel` | Cancel your own booking | Public |
| `GET` | `/reservations/{id}` | Fetch a booking | `reservation:read` |
| `PATCH` | `/reservations/{id}` | Edit a booking | `reservation:update` |
| `PATCH` | `/reservations/{id}/status` | Confirm, seat or close a booking | `reservation:update` |

### Tables & QR codes (10)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/tables` | List tables | `table:read` |
| `POST` | `/tables` | Add a table | `table:create` |
| `GET` | `/tables/scan/{token}` | Resolve a scanned QR code | Public |
| `GET` | `/tables/{id}` | Fetch a table | `table:read` |
| `PATCH` | `/tables/{id}` | Edit a table | `table:update` |
| `DELETE` | `/tables/{id}` | Delete a table | `table:delete` |
| `PATCH` | `/tables/{id}/active` | Withdraw or restore a table | `table:update` |
| `GET` | `/tables/{id}/qr.png` | QR code image | `table:read` |
| `POST` | `/tables/{id}/qr/rotate` | Rotate the QR token | `qr:manage` |
| `POST` | `/tables/{id}/qr/regenerate` | Re-render the QR image | `qr:manage` |

### Notifications (3)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/notifications` | The bell | Signed in |
| `PATCH` | `/notifications/{id}/read` | Mark one read | Signed in |
| `POST` | `/notifications/read-all` | Clear your bell | Signed in |

Read state is per user, so clearing your own bell does not hide new orders
from a screen nobody has looked at.

### Administration (19)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/admin/users` | List staff accounts | `user:read` |
| `POST` | `/admin/users` | Create a staff account | `user:create` |
| `GET` | `/admin/users/{id}` | Fetch a staff account | `user:read` |
| `PATCH` | `/admin/users/{id}` | Edit a staff account | `user:update` |
| `DELETE` | `/admin/users/{id}` | Deactivate a staff account | `user:delete` |
| `POST` | `/admin/users/{id}/reset-password` | Reset someone's password | `user:update` |
| `GET` | `/admin/roles` | List roles | `role:read` |
| `POST` | `/admin/roles` | Create a role | `role:create` |
| `GET` | `/admin/roles/{id}` | Fetch a role | `role:read` |
| `PATCH` | `/admin/roles/{id}` | Edit a role | `role:update` |
| `DELETE` | `/admin/roles/{id}` | Delete a role | `role:delete` |
| `PUT` | `/admin/roles/{id}/permissions` | Replace a role's permissions | `permission:assign` |
| `GET` | `/admin/permissions` | The permission catalogue | `permission:read` |
| `GET` | `/admin/customers` | List guests | `customer:read` |
| `GET` | `/admin/customers/{id}` | Fetch a guest | `customer:read` |
| `PATCH` | `/admin/customers/{id}` | Edit a guest | `customer:update` |
| `GET` | `/admin/settings` | Full restaurant settings | `settings:read` |
| `PATCH` | `/admin/settings` | Edit restaurant settings | `settings:update` |
| `GET` | `/admin/audit-logs` | The audit trail | `auditLog:read` |

### Reports (6)

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/admin/reports/dashboard` | Dashboard summary | `dashboard:view` |
| `GET` | `/admin/reports/sales` | Revenue per day | `report:view` |
| `GET` | `/admin/reports/revenue` | Revenue by period | `report:view` |
| `GET` | `/admin/reports/top-items` | Best sellers | `report:view` |
| `GET` | `/admin/reports/order-status` | Orders by status | `report:view` |
| `GET` | `/admin/reports/top-customers` | Highest-spending guests | `report:view` |

---

## 3. Permission catalogue

Every protected endpoint names one of these. Roles are rows in the database,
so a permission can be moved between roles without a code change.

| Area | Permissions |
| --- | --- |
| Menu | `category:read`, `category:create`, `category:update`, `category:delete`, `food:read`, `food:create`, `food:update`, `food:delete` |
| Orders | `order:read`, `order:create`, `order:updateStatus`, `order:cancel`, `kitchen:access` |
| Tables | `table:read`, `table:create`, `table:update`, `table:delete`, `qr:manage` |
| Reservations | `reservation:read`, `reservation:update` |
| People | `user:read`, `user:create`, `user:update`, `user:delete`, `customer:read`, `customer:update` |
| Access control | `role:read`, `role:create`, `role:update`, `role:delete`, `permission:read`, `permission:assign` |
| Insight | `dashboard:view`, `report:view`, `auditLog:read` |
| Settings | `settings:read`, `settings:update` |

---

## 4. Keeping this file honest

The API list is generated from [server/openapi.json](server/openapi.json),
which `npm run docs` rebuilds from the Zod validation schemas. CI fails if the
committed document is stale, and a test fails if the document and the
registered Express routes disagree — so an endpoint cannot be added, removed
or renamed without the spec following it. If you change routes, re-run
`npm run docs` in `server/` and update the tables above.
