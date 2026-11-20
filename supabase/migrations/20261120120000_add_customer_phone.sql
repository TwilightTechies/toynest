-- Customer accounts (ADR-022): a customer signs in with an email + password OR a mobile number + code,
-- so a phone-only account has no email. Phone numbers are stored in E.164 (+91 and 10 digits), the
-- format Supabase Auth uses.
alter table public.customers
  add column phone text unique check (phone ~ '^\+91[6-9][0-9]{9}$');

alter table public.customers alter column email drop not null;

alter table public.customers
  add constraint customers_email_or_phone check (email is not null or phone is not null);

-- The unique constraint indexes phone; email is already unique (and indexed).
