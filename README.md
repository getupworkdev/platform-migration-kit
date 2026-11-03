# Platform migration kit

How I move a React/Vite/TypeScript app off a proprietary app-builder backend (bundled database, auth and AI) onto Supabase, without rewriting the screens and without losing anything. Plus a live preview of the map layer that a content database with coordinates makes possible.

- **Live map preview:** https://getupworkdev.github.io/platform-migration-kit/map/
- `npm test` runs 11 tests in under a second, no Supabase account, no Docker.

Everything here is generic and fictional: no client code, data or brand.

## The migration, in three parts

### 1. Put the vendor behind an interface (`src/backend/`)

The first job in a migration is finding every place the app talks to the old platform and putting those calls behind one small interface: `auth`, `data`, `ai`, `storage` ([`types.ts`](src/backend/types.ts)). Two implementations exist side by side:

- [`legacy.ts`](src/backend/legacy.ts), the "before" side, wrapping the vendor's table API and field names;
- [`supabase.ts`](src/backend/supabase.ts), the "after" side: Postgres tables under RLS, passwordless auth, AI through an Edge Function so the provider key never ships to the browser.

One env flag picks the backend ([`index.ts`](src/backend/index.ts)), so the new version runs on a private staging link while the old site keeps serving users. [`tests/adapter.test.ts`](tests/adapter.test.ts) proves a screen renders the same on both.

### 2. Migrate users and content, idempotently (`migrate/`)

[`migrate.ts`](migrate/migrate.ts) reads the vendor export ([format](migrate/export-format.ts)) and writes to a [target](migrate/target.ts): in memory for tests and `--dry-run`, [Supabase](migrate/supabase-target.ts) for real.

| Rule | Why |
|---|---|
| Accounts are kept; passwords are not. Each user gets a one-time email link and may set a password afterwards. | Vendor password hashes are usually unusable elsewhere, and trying costs more than it saves. |
| A legacy id that is already mapped is skipped; an email that already exists is linked, never duplicated. | The script can be re-run after a crash, or on a second export, and ends in the same state. |
| Every content record is stored **twice**: the extracted fields the screens need, and the raw exported record as `jsonb`, untouched. | Nothing is lost, including fields nobody has looked at yet (tags, image refs, AI metadata, coordinates). Restructuring into a proper content model is a later, separate job that reads from `legacy_raw`. |
| Missing slugs are generated, duplicate slugs made unique, unknown authors reported rather than invented. | The new schema has constraints the old platform didn't. |
| Old URLs get a row in `redirects`. | Links already shared and indexed keep working after cutover. |

```bash
npm run migrate:dry     # runs on fixtures/legacy-export.json, prints the report
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx migrate/run.ts --export export.json
```

The report says exactly what happened (`created`, `alreadyMapped`, `matchedByEmail`, `skippedInvalid`, `unresolvedAuthors`, `redirects`), so a second run is expected to show zeros in the "created" columns. [`tests/migrate.test.ts`](tests/migrate.test.ts) covers each rule, including the second-run case.

### 3. The destination (`supabase/`)

[`0001_schema.sql`](supabase/migrations/0001_schema.sql): `profiles`, `legacy_user_map`, `articles` (with `legacy_raw jsonb`), `redirects`, RLS on every table from the first migration, a trigger that creates the profile row on sign-up, and the one admin helper the import needs. [`functions/ask`](supabase/functions/ask/index.ts) is the AI call as a Deno Edge Function.

## The map preview (`docs/map/`)

A static page: 15 real Irish heritage sites as GeoJSON with a `kind` (monument, sacred site, mythology, holy well, destination) and an `evidence` level (archaeologically supported / history and tradition / folklore), clustered markers, layer toggles, a list that mirrors the map, and a card per site linking to its article. It is rendered with MapLibre GL, the open-source fork of Mapbox GL with the same API, so it needs no access token; in production the same code runs on Mapbox GL with Mapbox styles and the Directions API for routes between itinerary stops.

The point of the preview is the data model, not the pins: in the real system `sites.geojson` is a query against the content database (`select ... where location && viewport and kind = any(...)`), so a newly published article with coordinates appears on the map the moment it is published, and an AI itinerary planner reads the same records.

## What this does not prove

It doesn't include a real vendor SDK or a real export; the assessment at the start of a migration maps the actual field names into [`export-format.ts`](migrate/export-format.ts) and [`legacy.ts`](src/backend/legacy.ts), and that is the only code that changes. It also doesn't run the Supabase target in CI (that needs a project); it is exercised against the same interface as the memory target.
