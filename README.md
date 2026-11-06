# XClub — UI-first prototype

**Your digital ticket to match day.**

A two-app prototype for a single football club:

- **Customer mobile app** (Expo / React Native) — fixtures, news, exact-seat booking, mock Stripe checkout, digital QR match pass, order receipts.
- **Admin web dashboard** (Next.js) — fixture management, seating zones and prices, news publishing, gate QR validation, orders and passes.

This is **Phase A**: the full experience runs on a deterministic mock data layer with local persistence. Payments and QR validation are simulated. The data layer is designed to be swapped for Supabase + Stripe in Phase B/C.

---

## Quick start

```bash
npm install
```

Run the admin dashboard:

```bash
npm run admin
# http://localhost:3000
```

Run the mobile app:

```bash
npm run mobile
# then press w for web, or scan the QR with Expo Go
```

Or run the mobile app directly in a browser:

```bash
npm run mobile:web
```

### Demo credentials

Any email + password works in mock mode.

| Role | Email | Password |
| --- | --- | --- |
| Admin (web) | `admin@xclub.app` | `xclubadmin` |
| Fan (mobile) | `fan@xclub.app` | `xclubdemo` |

The mobile login also has a **Continue with demo fan account** button. The demo account starts with one active pass and one used pass.

---

## Demo script (5 minutes)

1. **Admin** — sign in, open **Matches & seating**, create a fixture, adjust a zone price.
2. **Fan** — sign in on mobile, open the next fixture, choose a stand, select exact seats.
3. **Fan** — continue to checkout, confirm the mock card, pay. The digital pass appears with a QR code.
4. **Admin** — open **Gate validation**, start the camera and scan the pass, or paste the payload.
5. **Admin** — the pass is approved and marked used. Scanning it again returns **Already scanned**.
6. **Fan** — open **Orders & receipts** and download a PDF receipt.

The admin **Gate validation** screen includes a sample QR code and a **Validate demo pass now** button, so the flow can be demonstrated without a second device.

---

## What is mocked

| Area | Phase A behaviour | Production target |
| --- | --- | --- |
| Authentication | Local demo profiles | Supabase Auth + role claims |
| Data | Shared TypeScript seed + localStorage | Postgres + RLS |
| Payment | Simulated success after 1.7s | Stripe Hosted Checkout (test mode, THB) |
| Ticket issuing | Locally generated ticket + mock QR payload | Webhook-issued tickets with signed tokens |
| QR validation | Payload decoding + local used-ticket registry | Server-side HMAC validation RPC |
| Receipts | Generated from mock orders | Stripe/customer receipt + server record |
| Push notifications, wallet, merch, chat | Not included | Post-MVP |

Prices are stored in **satang** and formatted as **THB** (`฿450`).

---

## Repository structure

```text
.
├── apps/
│   ├── mobile/                 # Expo + React Native + Expo Router
│   │   └── src/
│   │       ├── app/            # Routes: auth, tabs, match, seats, checkout, ticket, news, orders
│   │       ├── components/     # UI kit, match cards, ticket cards
│   │       └── lib/            # Mock store, theme
│   └── admin/                  # Next.js 16 + Tailwind 4
│       └── src/
│           ├── app/
│           │   ├── login/
│           │   └── dashboard/  # Overview, matches, seating, news, scan, tickets
│           ├── components/     # Shell, logo, modal, badges
│           └── lib/            # Mock admin store
├── packages/
│   └── shared/                 # Types, theme tokens, seed data, QR codec
└── README.md
```

### Shared contracts

`packages/shared` is the single source of truth for:

- data types (`Match`, `Zone`, `Seat`, `Ticket`, `Order`, `NewsItem`)
- THB/date formatting
- demo fixtures, zones, news, orders, tickets
- mock QR encoding/decoding

Both apps import this package, so the mock will not drift from the eventual Supabase schema.

---

## Mobile app routes

| Route | Screen |
| --- | --- |
| `/welcome` | Branded onboarding |
| `/login`, `/register` | Mock authentication |
| `/` | Home: next match, fixtures, news, results |
| `/match/[id]` | Match detail and seating zones |
| `/seats/[matchId]` | Exact seat grid with availability |
| `/checkout` | Mock payment and order summary |
| `/ticket/[id]` | Digital QR pass |
| `/tickets` | Active and past passes |
| `/orders` | Order history + PDF receipt |
| `/news/[id]` | Article |
| `/profile` | Supporter account |

## Admin routes

| Route | Screen |
| --- | --- |
| `/login` | Admin authentication |
| `/dashboard` | Overview, revenue pulse, gate status |
| `/dashboard/matches` | Fixture list, create/edit/delete |
| `/dashboard/matches/[id]` | Zone, price, row and seat configuration |
| `/dashboard/news` | Article publishing and editing |
| `/dashboard/scan` | Camera scanner + manual payload + demo QR |
| `/dashboard/tickets` | Orders, pass registry, CSV export, reset demo |

---

## Design system

Placeholder club identity, no real club assets:

- Pitch green `#0B6B3A`
- Gold `#F4C430`
- Night `#07130D`
- Ink `#0F172A`
- Barlow Condensed for display type, Inter for body

The mobile theme lives in `apps/mobile/src/lib/theme.ts`; the shared palette lives in `packages/shared/src/theme.ts`; admin tokens live in `apps/admin/src/app/globals.css`.

---

## Phase B/C roadmap

**Phase B — real data**

- Supabase schema: profiles, matches, zones, seats, orders, order_seats, seat_holds, tickets, news.
- Admin/customer auth with role-based access and RLS.
- Transactional seat holds with expiry and unique constraints.
- Replace `MockDataSource` reads/writes with Supabase queries.

**Phase C — real payment and gate validation**

- Stripe Hosted Checkout session created by an Edge Function using DB-calculated THB amounts.
- `checkout.session.completed` webhook issues tickets idempotently.
- Signed, opaque ticket tokens validated server-side and marked used atomically.
- Offline ticket cache; gate validation still requires connectivity.
- EAS build / deployment.

---

## Quality checks

```bash
npm run typecheck
npm run build:admin
```

Both workspaces are TypeScript strict and the admin app passes a production build.
