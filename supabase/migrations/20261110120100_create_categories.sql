create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) > 0),
  -- Attribute names every product in this category must state, e.g. {ageRange,material}.
  required_attributes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

-- The catalogue is public. No insert/update/delete policies: only the server (service role) writes.
create policy "Categories are readable by everyone"
  on public.categories for select
  to anon, authenticated
  using (true);
