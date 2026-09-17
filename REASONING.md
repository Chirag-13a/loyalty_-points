# Reasoning

## Approach

The problem asked for the counter to always show the correct, live points balance. Before touching UI, the build order was: earning logic → tier logic → redemption logic → member lookup — since a wrong balance anywhere upstream would make everything built on top of it (tiers, redemption limits, dashboards) unreliable.

## Design decisions

The application is split into a small Express API and a Vite React SPA. Mongoose models keep the domain objects explicit: `Member`, `Tier`, `Transaction`, `RedemptionItem`, and `StaffUser`. The frontend talks only to the REST API, so the same business rules apply to the dashboard and to any future client.

**Ledger over snapshot-only.** Every earn and redemption creates a `Transaction` record, and the member document also keeps a `balance` and `lifetimePoints` snapshot for fast reads at the counter. `lifetimePoints` is used for tier qualification and never decreases; `balance` is the spendable ledger and only decreases on redemption. The transaction history is the audit trail behind both numbers, so the balance shown at the counter can always be traced back to a concrete sequence of events rather than trusted blindly.

**Ordering guarantee.** The important invariant is that an earn transaction is recorded before the member snapshot is updated, and a redemption is refused before any transaction can be created if the balance is insufficient — so a failed redemption never leaves a partial/negative-balance transaction behind.

**Two separate auth systems, not one with roles bolted on.** Member authentication is kept fully separate from staff authentication (`StaffUser` vs member accounts, different JWT payloads) rather than a single user table with a role flag. This was a deliberate choice: a member token should only ever be able to read that member's own balance/history and view catalogs, while a staff token retains the counter operations (purchases, redemptions, catalog management). Keeping the models and auth flows separate made it easier to enforce this boundary consistently in middleware rather than remembering to check a role field on every query.

**Local JSON fallback.** The local JSON store intentionally mirrors the MongoDB collections one-for-one, so the member portal and staff counter can run in an environment like Codespaces without MongoDB installed, while keeping the exact same REST contracts for a later MongoDB deployment. This meant business logic (earning, tiers, redemption, validation) never had to branch on which storage backend was active.

## Testing performed

- `node --check` against the server entry point and core route modules to catch syntax errors early
- Installed dependencies with npm and confirmed a clean install
- `npm run build` for the React client — Vite build completed with no errors
- `/api/health` endpoint added as a cheap environment/liveness check; full persistence checks require a MongoDB URI in `.env`
- Backend validation added and tested for: credentials, phone number format, purchase amounts, reward costs, and required fields on all forms
- Server-side member pagination, sorting, and transaction filters manually tested with varied query parameters
- Dashboard aggregate endpoints checked against manually seeded data to confirm totals matched
- Catalog CRUD endpoints (menu/rewards/offers) tested with staff token (success) and member token (expected 403)
- Client-side debounce, loading states, empty states, toast feedback, and confirmation dialogs manually verified in-browser
- Confirmed the UI reflects a fresh member read after every purchase/redemption rather than relying on stale local state

## Bugs found and fixed

| Issue | Fix |
|---|---|
| Directory sorting omitted tier, and search fired a request on every keystroke | Added tier as a sortable field on the backend; added a 350ms debounce on the search input |
| Profile page went stale after the member/transactions APIs were split | Profile now independently fetches a fresh member snapshot and a filtered transaction list |
| Purchase/redemption responses could leave stale balances on screen | Both mutation endpoints now return the saved member, and purchase additionally triggers a fresh member read on the client |
| Forms relied only on browser-side validation | Added shared backend validation returning clear `400`/`409`/`401` messages |
| No way to manage the reward catalog | Added authenticated `POST`/`PATCH` endpoints plus a staff catalog management page |
| Registration failed unclearly when MongoDB was unreachable | API now returns clear validation errors and falls back to the persistent JSON store, so local dev works end-to-end without MongoDB |
| No staff profile/logout flow | Added staff profile and logout routes, plus a sage/forest color system to make navigation and account state clearer at a glance |
| Member API originally allowed self-redemption | Deliberately removed — members can view rewards and balance, but only staff purchase/counter routes can mutate loyalty state. Enforced with a `403` at the middleware level for member tokens on staff-only routes, independent of whatever the frontend does or doesn't render |
| Member visit history could theoretically be queried by arbitrary ID | `/api/members/me/transactions` derives the member's identity from their own JWT rather than accepting an ID from the request — a member can never fetch or infer another member's history |

## Tradeoffs

The app keeps a member snapshot (`balance`, `lifetimePoints`, `tier`) for fast counter reads, in addition to writing every ledger event to `Transaction`. This is fine at demo scale but has a known limit: for a high-concurrency production deployment, purchase and redemption updates should be wrapped in MongoDB transactions or atomic conditional updates (`findOneAndUpdate` with a balance guard) rather than read-then-write, and the snapshot should be periodically reconciled against the transaction ledger to catch any drift. This wasn't implemented here given the scope and time constraints, but the ledger-first design means reconciliation is straightforward to add later without changing the data model.
