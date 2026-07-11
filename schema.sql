-- ClockWA — Supabase schema
-- Multi-tenant WhatsApp attendance system

create extension if not exists "uuid-ossp";

-- ============================================================
-- COMPANIES (each client of ClockWA is a company/tenant)
-- ============================================================
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  currency text not null default 'ZAR',        -- 'ZAR', 'USD', 'CDF'
  country text not null default 'ZA',           -- ISO country code
  overtime_rate_multiplier numeric default 1.5, -- e.g. 1.5x for overtime
  sunday_rate_multiplier numeric default 2.0,
  standard_daily_hours numeric default 8,
  photo_verification_required boolean default true,
  geofence_radius_meters int default 150,
  retention_months int default 24,              -- POPIA-style data retention
  created_at timestamptz default now()
);

-- ============================================================
-- SITES (a company can have many sites/zones)
-- ============================================================
create table sites (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,               -- e.g. "Store 4", "Piste A2"
  latitude numeric not null,
  longitude numeric not null,
  radius_meters int,                -- overrides company default if set
  created_at timestamptz default now()
);

-- ============================================================
-- EMPLOYEES
-- ============================================================
create table employees (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  site_id uuid references sites(id),
  full_name text not null,
  whatsapp_number text not null,     -- E.164 format, e.g. +27821234567
  language text not null default 'en', -- 'en' or 'fr' — controls WhatsApp prompt language
  pin_hash text,                     -- for PIN-based auth, matching your other products
  hourly_rate numeric,
  active boolean default true,
  created_at timestamptz default now(),
  unique (company_id, whatsapp_number)
);

create index idx_employees_whatsapp on employees(whatsapp_number);

-- ============================================================
-- CLOCK EVENTS (in / lunch_out / lunch_in / out)
-- ============================================================
create table clock_events (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid references employees(id) on delete cascade,
  site_id uuid references sites(id),
  event_type text not null check (event_type in ('clock_in', 'lunch_out', 'lunch_in', 'clock_out')),
  client_timestamp timestamptz not null,   -- locked on phone at time of tap
  server_received_at timestamptz default now(), -- may lag if offline/queued
  latitude numeric,
  longitude numeric,
  within_geofence boolean,
  photo_url text,                          -- only required on clock_in
  synced_late boolean default false,       -- true if server_received_at - client_timestamp > 5 min
  created_at timestamptz default now()
);

create index idx_clock_events_employee_day on clock_events(employee_id, client_timestamp);

-- ============================================================
-- SHIFT SWAPS
-- ============================================================
create table shift_swaps (
  id uuid primary key default uuid_generate_v4(),
  requesting_employee_id uuid references employees(id),
  covering_employee_id uuid references employees(id),
  site_id uuid references sites(id),
  shift_date date not null,
  shift_start time not null,
  shift_end time not null,
  status text not null default 'pending' check (status in ('pending', 'broadcast', 'accepted', 'confirmed', 'cancelled')),
  requested_at timestamptz default now(),
  resolved_at timestamptz
);

-- ============================================================
-- ALERTS (AI-flagged anomalies, surfaced to supervisors)
-- ============================================================
create table alerts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references companies(id) on delete cascade,
  employee_id uuid references employees(id),
  alert_type text not null,     -- 'late', 'absent', 'out_of_zone', 'overtime', 'no_clockin_streak'
  message text not null,
  severity text default 'info' check (severity in ('info', 'warning', 'critical')),
  resolved boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table companies enable row level security;
alter table sites enable row level security;
alter table employees enable row level security;
alter table clock_events enable row level security;
alter table shift_swaps enable row level security;
alter table alerts enable row level security;

-- Example policy: a company's admin can only see their own company's data.
-- Adjust auth.jwt() claims to match your admin-auth setup (Supabase Auth custom claims or PIN-based session).
create policy "Company isolation - sites"
  on sites for all
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "Company isolation - employees"
  on employees for all
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "Company isolation - alerts"
  on alerts for all
  using (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- clock_events and shift_swaps are scoped via employee -> company join;
-- enforce in application layer or via a security-definer function if needed.
