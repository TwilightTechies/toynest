-- Staff who may edit the catalogue (ADR-016). A table rather than a JWT claim, so removing a row
-- revokes admin rights on the next request instead of when the token next refreshes.
create table public.admin_users (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: only the service role (the create-admin script) reads or writes it.
alter table public.admin_users enable row level security;

-- security definer: runs as the owner, so it can read admin_users although callers can't.
-- search_path = '' and fully qualified names stop a caller's objects from shadowing ours.
-- stable + (select auth.uid()): evaluated once per statement when used in a policy.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where auth_user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
