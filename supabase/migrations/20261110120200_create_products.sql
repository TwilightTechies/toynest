create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 5000),
  category_id uuid not null references public.categories (id),
  -- Money in integer minor units (pence), matching the domain (ADR-011).
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- Category attributes such as {"ageRange": "3-5 years", "material": "Wood"}.
  attributes jsonb not null default '{}',
  -- Full-text search: english stemming; name outranks description.
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', name), 'A') ||
    setweight(to_tsvector('english', description), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);
create index products_status_idx on public.products (status);
create index products_search_vector_idx on public.products using gin (search_vector);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

-- Shoppers see only active products. Drafts and archived products stay server-side.
create policy "Active products are readable by everyone"
  on public.products for select
  to anon, authenticated
  using (status = 'active');
