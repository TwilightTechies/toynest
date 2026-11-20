-- Shop-wide switches that admins change without a deploy (ADR-022). Exactly one row.
create table public.store_settings (
  id uuid primary key default gen_random_uuid(),
  -- Always true and unique: a second row can't be inserted.
  singleton boolean not null default true unique check (singleton),
  -- Mobile number sign-in with a one-time code. Off by default: SMS costs money once a real
  -- provider is connected. The send_sms hook refuses to send codes while this is false.
  phone_otp_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger store_settings_set_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

insert into public.store_settings default values;

alter table public.store_settings enable row level security;

-- Admins read and change the settings with their own session (user-scoped client, ADR-016).
-- No insert or delete policy: the single row is created here and never removed.
create policy "Admins read store settings"
  on public.store_settings for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins update store settings"
  on public.store_settings for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- The auth server's hook reads the OTP switch (see create_sms_outbox_and_send_sms_hook).
grant usage on schema public to supabase_auth_admin;
grant select on table public.store_settings to supabase_auth_admin;

create policy "Auth hook reads store settings"
  on public.store_settings for select
  to supabase_auth_admin
  using (true);
