-- Mock SMS delivery for mobile sign-in codes (ADR-022). Supabase Auth still creates and checks every
-- code; this "Send SMS" auth hook replaces the SMS provider and writes the code to an outbox instead
-- of sending a text message. A real provider (MSG91, Twilio) later replaces the hook in the dashboard.
create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  otp text not null check (otp ~ '^[0-9]{4,10}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Latest code for this number" (server log, tests) and "last 20" (admin page).
create index sms_outbox_phone_created_at_idx on public.sms_outbox (phone, created_at desc);
create index sms_outbox_created_at_idx on public.sms_outbox (created_at desc);

create trigger sms_outbox_set_updated_at
  before update on public.sms_outbox
  for each row execute function public.set_updated_at();

alter table public.sms_outbox enable row level security;

-- Codes are secrets: shoppers (anon, authenticated) can never read them, stated explicitly.
-- Admins see recent codes on /admin/settings; the server reads them with the service role.
create policy "Sign-in codes are hidden from shoppers"
  on public.sms_outbox as restrictive for all
  to anon
  using (false)
  with check (false);

create policy "Admins read recent sign-in codes"
  on public.sms_outbox for select
  to authenticated
  using ((select public.is_admin()));

grant insert on table public.sms_outbox to supabase_auth_admin;

create policy "Auth hook writes sign-in codes"
  on public.sms_outbox for insert
  to supabase_auth_admin
  with check (true);

-- The hook. Supabase recommends NOT using security definer for auth hooks: the function runs as
-- supabase_auth_admin, which gets exactly the grants above and nothing else.
-- Returning {"error": ...} makes the auth server refuse the sign-in request, so switching mobile
-- sign-in off holds even for someone calling the Supabase Auth API directly, not just in the app.
create function public.send_sms_mock(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  enabled boolean;
begin
  select phone_otp_enabled into enabled from public.store_settings limit 1;
  if not coalesce(enabled, false) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Mobile number sign-in is turned off.'
    ));
  end if;

  insert into public.sms_outbox (phone, otp)
  values ('+' || ltrim(event -> 'user' ->> 'phone', '+'), event -> 'sms' ->> 'otp');

  return '{}'::jsonb;
end;
$$;

revoke execute on function public.send_sms_mock(jsonb) from public, anon, authenticated;
grant execute on function public.send_sms_mock(jsonb) to supabase_auth_admin;
