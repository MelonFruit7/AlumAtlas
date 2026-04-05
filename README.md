# Alum Atlas

Next.js app for student organizations to create share links and visualize where members and alumni ended up on a map.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres + Storage
- MapLibre GL + OpenStreetMap tiles
- Geoapify geocoding (submission path)
- Vitest for unit tests

## Features Implemented

- Creator page (`/`) for generating a share link.
- Group page (`/g/[slug]`) with:
  - contributor submission form
  - one profile per device (repeat submit edits existing profile)
  - optional profile photo URL
  - optional profile photo upload with in-app crop (pan + zoom)
  - LinkedIn URL (used as clickable name link)
  - company domain -> favicon logo URL
  - map with semantic zoom: `world -> country -> state -> city`
  - Geoapify location search for map fly-to
  - US-first depth; non-US is country-level aggregation.
- Admin page (`/g/[slug]/admin`) with:
  - password-protected admin login
  - add/edit/delete entries
  - board title/description edits
  - submissions lock toggle
- Device-based upsert:
  - one entry per browser device per group
  - same device can update its existing entry.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and fill values:

```bash
cp .env.example .env.local
```

Required env vars for priority path:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEOAPIFY_API_KEY`
- `ADMIN_SESSION_SECRET`

3. Apply database schema in Supabase SQL editor:

```sql
-- paste contents of supabase/schema.sql
```

4. Run dev server:

```bash
npm run dev
```

## One-Time Coordinate Repair

If legacy entries have inaccurate geocodes, run the maintenance script:

Dry-run (no DB writes):

```bash
npm run repair:geocodes
```

Apply updates:

```bash
npm run repair:geocodes:apply
```

Optional scope to one board:

```bash
npm run repair:geocodes -- --group-slug=my-board-slug
```

The script re-geocodes each `location_text` with Geoapify and updates only:
`lat`, `lng`, `country_code`, `country_name`, `state_region`, `city`, `is_us`.

## API Routes

- `POST /api/groups`
- `GET /api/groups/[slug]`
- `POST /api/groups/[slug]/entry`
- `GET /api/groups/[slug]/entry/me?deviceToken=`
- `GET /api/groups/[slug]/map-data?bbox&zoom`
- `GET /api/groups/[slug]/search?q=`
- `POST /api/uploads/profile-photo`
- `POST /api/groups/[slug]/admin/login`
- `POST /api/groups/[slug]/admin/logout`
- `GET /api/groups/[slug]/admin/entries`
- `POST /api/groups/[slug]/admin/entries`
- `PATCH /api/groups/[slug]/admin/entries/[entryId]`
- `DELETE /api/groups/[slug]/admin/entries/[entryId]`
- `PATCH /api/groups/[slug]/admin/settings`

## Tests

Run unit tests:

```bash
npm test
```
