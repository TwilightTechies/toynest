-- Delivery charges by pincode zone (ADR-015). Rates are data, so they change without a deploy.
-- A pincode matches the zone with the longest matching prefix; anything else uses the default zone.
create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 60),
  -- Money in integer minor units (paise), matching the domain (ADR-011, ADR-014).
  fee_minor integer not null check (fee_minor >= 0),
  -- Subtotal at or above which delivery is free; null = never free.
  free_over_minor integer check (free_over_minor >= 0),
  -- Prefixes of 1-6 digits, e.g. {560,110} or {78,79}.
  pincode_prefixes text[] not null default '{}'
    check (array_to_string(pincode_prefixes, ',') ~ '^(\d{1,6}(,\d{1,6})*)?$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default zone.
create unique index shipping_zones_one_default_idx on public.shipping_zones (is_default) where is_default;

create trigger shipping_zones_set_updated_at
  before update on public.shipping_zones
  for each row execute function public.set_updated_at();

alter table public.shipping_zones enable row level security;

-- Delivery rates are public information. Only the server (service role) changes them.
create policy "Shipping zones are readable by everyone"
  on public.shipping_zones for select
  to anon, authenticated
  using (true);
