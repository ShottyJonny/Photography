-- Jon Hoffman Photography -- database schema
--
-- TARGET: the Next.js rebuild (product.md §1.5). This is NOT wired to the legacy
-- Vite app and must not be -- that app's Supabase integration has never once
-- worked (its project was paused 16 months before the repo existed) and it is
-- being deleted, not repaired.
--
-- Run top-to-bottom in the Supabase SQL editor on the NEW project.
-- Every statement is idempotent; safe to re-run.
--
-- Companion docs:
--   product.md §3   -- what the data model must become
--   product.md §5   -- admin: ingest, collections, literature
--   product.md §6.1 -- the fulfillment state machine (order_status, below)
--   product.md §6.3 -- amount reconciliation
--   design.md  §11  -- the admin surfaces that read and write all of this
--
-- ===========================================================================
-- RLS POSTURE -- read this before changing a policy
-- ===========================================================================
-- Deny by default. `anon` may read PUBLISHED photos and collections. It has NO
-- access to `orders` in any direction -- not select, not insert.
--
-- Why orders are completely closed to anon: RLS filters rows, it cannot require
-- that a caller named an id. A SELECT policy permissive enough to let a customer
-- read their own confirmation page is automatically permissive enough to dump the
-- whole table -- and the anon key ships inside the browser bundle, so it is public
-- by construction. Every order read and write therefore goes through the SERVICE
-- key from a server route (Next.js route handler / server component), which
-- bypasses RLS entirely.
--
-- !! BEFORE THIS HOLDS: DISABLE PUBLIC SIGNUPS !!
-- The admin policies below grant full access to the `authenticated` role. Supabase
-- allows public signup by default. If it is left on, ANYONE can create an account,
-- become `authenticated`, and read every customer's name, email, and address.
-- Turn signups off: Dashboard -> Authentication -> Sign In / Providers -> disable
-- "Allow new users to sign up". product.md §5.1: one admin, no plan for a second.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- product.md §6.1. Forward-only except cancelled/refunded.
-- NO state is ever set by a timer. The live site once set `shipped` on a 900ms
-- setTimeout and generated a fake UPS tracking number for every customer; that is
-- the failure this enum exists to make impossible.
do $$ begin
  create type order_status as enum (
    'pending',           -- saved; payment not confirmed
    'paid',              -- Stripe webhook confirmed payment
    'amount_mismatch',   -- session.amount_total != stored total (§6.3). QUARANTINE.
    'submitted_to_lab',  -- Jon placed the order at Nations Photo Lab
    'shipped',           -- Jon shipped it and entered real tracking
    'cancelled',
    'refunded'
  );
exception when duplicate_object then null; end $$;

-- design.md §12.5-D: the register toggle. The legacy app models this as
-- `blackAndWhite: boolean`; 'silver' is the same thing with the design's name.
do $$ begin
  create type print_register as enum ('colour', 'silver');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
-- Named `photos`, not `products` (product.md §3 says "a products table" -- update
-- it). The sellable unit is photo x size x register; the photo is the work, not
-- the SKU. Calling it `products` invites a price column, which is the next note.
--
-- THERE IS NO PRICE COLUMN, AND THAT IS DELIBERATE.
-- Price is keyed ONLY by size, on both the client (PRICE_BY_SIZE) and the server
-- (netlify/functions/lib/pricing.js). product.md §8 q3 (per-photo pricing) is OPEN.
-- Until it lands, a price column here reads nothing.
--
-- The cost of getting this wrong is already sitting in the repo: products.ts
-- carries `price: 15000` on all 24 rows -- $150, uniform, wrong, and overridden at
-- runtime by PricingContext so no customer ever saw it. It survived precisely
-- because nothing read it. It was still alive enough to fool a designer into
-- printing "$150 base" onto an admin mockup, which nearly became a spec.
-- Do not rebuild that field. If §8 q3 lands, ALTER TABLE then -- and move
-- netlify/functions/lib/pricing.js in the same commit. It is a hand-maintained
-- mirror with no test enforcing it.
create table if not exists photos (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,            -- Playfair. The work's name.
  caption         text,                     -- Newsreader. The short line on the card.
  description     text,                     -- Newsreader. The print's own page.
  alt_text        text,                     -- Describes the image. Accessibility only.
  aspect_ratio    numeric(6,4),             -- measured once, at ingest
  width_px        integer,
  height_px       integer,
  aura            jsonb,                    -- SPECULATIVE -- see note below
  published       boolean not null default false,  -- false = unlisted (§8 q4)
  has_bw_variant  boolean not null default false,
  original_key    text,                     -- key in the PRIVATE `originals` bucket
  original_bw_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- product.md §5.2: the a11y audit found every image used the product's TITLE as
  -- alt text, so a blind customer could not learn what a print depicts. "Deterioration"
  -- describes nothing. Alt is a field a human fills in -- so make publishing without
  -- it impossible rather than merely discouraged.
  constraint alt_text_required_when_published
    check (not published or (alt_text is not null and length(btrim(alt_text)) > 0))
);

-- `aura` is SPECULATIVE, not a feature (design.md §10 q3, product.md §3).
-- design.md §12.1 rejected borrowed colour, which was this column's entire
-- justification. Nothing on the storefront reads it; the hero's colour bleed is a
-- blur of the actual plate, not a computed average. It is stored only because it is
-- cheap with the file in hand and expensive to backfill.
-- jsonb because the shape is unsettled and nobody has reconciled it:
-- src/utils/color.ts averageColor() returns ONE {r,g,b}; design.md §11.4-C draws
-- THREE swatches. Do not build UI implying this is live.

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
create table if not exists collections (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,           -- Playfair
  dek              text,                    -- Newsreader italic. collections.ts calls this `description`.
  literature       text,                    -- THE ESSAY. design.md §1: where the voice lives.
  cover_photo_id   uuid references photos(id) on delete set null,
  featured_on_home boolean not null default false,  -- design.md §11.4-G, the home focal point
  position         integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Exactly one collection leads home (design.md §11.4-G). Enforce it rather than
-- trusting the admin UI to keep the radio group honest.
create unique index if not exists collections_one_featured
  on collections (featured_on_home) where featured_on_home;

-- ---------------------------------------------------------------------------
-- collection_photos -- the join, carrying editorial order
-- ---------------------------------------------------------------------------
-- product.md §5.3: "order them (sequence is editorial -- it is how a collection
-- reads)". `position` is the entire reason this is a table and not an array.
create table if not exists collection_photos (
  collection_id uuid not null references collections(id) on delete cascade,
  photo_id      uuid not null references photos(id) on delete cascade,
  position      integer not null,
  primary key (collection_id, photo_id)
);

create unique index if not exists collection_photos_position
  on collection_photos (collection_id, position);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
-- Note the column is `created_at`. Orders.tsx:17 read `o.createdAt` against a row
-- saved as `created_at`, so every order in the legacy admin rendered "Invalid Date"
-- and the sort was NaN. snake_case, everywhere, no exceptions.
create table if not exists orders (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  customer_email           text not null,
  customer_name            text,

  -- THE ONLY PLACE THIS EXISTS. create-checkout-session.js sets no
  -- shipping_address_collection, so Stripe never receives an address -- the client
  -- POSTs only {country, region}, and only to price tax and shipping. If this
  -- column is not written, the order cannot be fulfilled at any price.
  shipping_address         jsonb not null,

  status                   order_status not null default 'pending',

  -- Money, in cents, derived SERVER-SIDE. Never read back from the client.
  subtotal_cents           integer not null,
  shipping_cents           integer not null,
  tax_cents                integer not null,
  total_cents              integer not null,

  -- §6.3 reconciliation. The webhook compares amount_paid_cents to total_cents and
  -- sets `amount_mismatch` instead of `paid` when they diverge.
  stripe_session_id        text,
  stripe_payment_intent_id text,
  amount_paid_cents        integer,

  -- Fulfillment. Every one of these is set by a human pressing a button (§1, §6.1).
  submitted_to_lab_at      timestamptz,
  shipped_at               timestamptz,
  tracking_number          text,
  lab_finish               text default 'Lustre',  -- design.md §11.4-E export header
  notes                    text,

  -- design.md §11.6 / product.md §6.1: "shipped is the ONLY state that may show a
  -- tracking number, and only after a human enters it." Keyed to shipped_at rather
  -- than status so it survives a later refund or cancellation of a shipped order.
  constraint tracking_requires_shipment
    check (tracking_number is null or shipped_at is not null),

  -- A quarantined order must record what was actually paid -- design.md §11.4-D
  -- renders "paid $X · expected $Y", and it cannot invent X.
  constraint mismatch_records_amount_paid
    check (status <> 'amount_mismatch' or amount_paid_cents is not null)
);

-- §6.4: the default view is the work queue -- paid, oldest first.
create index if not exists orders_queue on orders (status, created_at);
create index if not exists orders_email on orders (customer_email);

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
-- A real table, not `items jsonb`, because §6.2's lab export iterates line items
-- and the queue counts them.
--
-- Every descriptive field is SNAPSHOTTED at purchase, not joined from photos. An
-- order is a receipt: renaming or deleting a photo must never retroactively change
-- what someone bought. photo_id is a soft link, kept only so the export can reach
-- the ORIGINAL file (§6.2, §11.6 "pull the original for fulfillment links").
create table if not exists order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  photo_id       uuid references photos(id) on delete set null,  -- soft link, may go null
  title          text not null,             -- snapshot
  size           text not null,             -- snapshot. '4x6' .. '20x30'
  register       print_register not null default 'colour',
  qty            integer not null check (qty > 0),
  unit_cents     integer not null,          -- snapshot of the server-computed price
  original_key   text                       -- snapshot: what fulfillment actually pulls
);

create index if not exists order_items_order on order_items (order_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists photos_updated_at on photos;
create trigger photos_updated_at before update on photos
  for each row execute function set_updated_at();

drop trigger if exists collections_updated_at on collections;
create trigger collections_updated_at before update on collections
  for each row execute function set_updated_at();

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table photos            enable row level security;
alter table collections       enable row level security;
alter table collection_photos enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;

-- --- public reads: PUBLISHED work only -------------------------------------
-- Unlisted photos (§8 q4) stay invisible to anon. If direct-link access survives
-- as a feature, it must be served by a server route, not by loosening this.
drop policy if exists photos_public_read on photos;
create policy photos_public_read on photos
  for select to anon, authenticated using (published);

drop policy if exists collections_public_read on collections;
create policy collections_public_read on collections
  for select to anon, authenticated using (true);

drop policy if exists collection_photos_public_read on collection_photos;
create policy collection_photos_public_read on collection_photos
  for select to anon, authenticated
  using (exists (select 1 from photos p where p.id = photo_id and p.published));

-- --- admin: the single authenticated user (§5.1) ---------------------------
-- Gated on `authenticated`, which is only safe with public signup DISABLED.
-- See the banner at the top of this file. This is the sharpest edge here.
drop policy if exists photos_admin_all on photos;
create policy photos_admin_all on photos
  for all to authenticated using (true) with check (true);

drop policy if exists collections_admin_all on collections;
create policy collections_admin_all on collections
  for all to authenticated using (true) with check (true);

drop policy if exists collection_photos_admin_all on collection_photos;
create policy collection_photos_admin_all on collection_photos
  for all to authenticated using (true) with check (true);

drop policy if exists orders_admin_all on orders;
create policy orders_admin_all on orders
  for all to authenticated using (true) with check (true);

drop policy if exists order_items_admin_all on order_items;
create policy order_items_admin_all on order_items
  for all to authenticated using (true) with check (true);

-- --- orders: anon gets NOTHING ---------------------------------------------
-- Deliberately no anon policy on orders or order_items. Not select, not insert.
-- Checkout writes through the service key from a server route; the confirmation
-- page reads back the same way. Do not add an anon policy here to "make checkout
-- work" -- that is the exposure this whole schema is shaped to prevent.

-- ===========================================================================
-- Storage
-- ===========================================================================
-- product.md §3: two tiers, and the split is load-bearing.
--   originals   -- PRIVATE. The full-resolution print file. Fulfillment only.
--                  Never served to a browser. (bw/Omniprominence.jpg is 32MB and
--                  is currently sent to phones. That stops here.)
--   derivatives -- PUBLIC. Generated once, at ingest: thumb, display, srcset widths.
insert into storage.buckets (id, name, public)
values ('originals', 'originals', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('derivatives', 'derivatives', true)
on conflict (id) do nothing;

-- Originals: admin only. anon has no path to them at all.
drop policy if exists originals_admin_all on storage.objects;
create policy originals_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'originals') with check (bucket_id = 'originals');

-- Derivatives: public read, admin write.
drop policy if exists derivatives_public_read on storage.objects;
create policy derivatives_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'derivatives');

drop policy if exists derivatives_admin_write on storage.objects;
create policy derivatives_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'derivatives') with check (bucket_id = 'derivatives');
