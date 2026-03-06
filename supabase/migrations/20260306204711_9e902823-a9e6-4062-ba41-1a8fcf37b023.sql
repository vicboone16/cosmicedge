
-- =====================================================
-- COSMICEDGE CONTENT LAYER
-- Glossary + Formulas + Info Pages + Engine Registry
-- =====================================================

-- 1) GLOSSARY
create table if not exists public.ce_glossary (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  term text not null,
  category text default 'general',
  short_definition text,
  full_definition text,
  related_terms jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  display_order int default 0,
  is_featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ce_glossary_term on public.ce_glossary(term);
create index if not exists idx_ce_glossary_category on public.ce_glossary(category);

-- 2) FORMULAS
create table if not exists public.ce_formulas (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  formula_name text not null,
  category text default 'core',
  formula_text text,
  plain_english text,
  variables jsonb default '{}'::jsonb,
  example_input jsonb default '{}'::jsonb,
  example_output jsonb default '{}'::jsonb,
  notes text,
  display_order int default 0,
  is_featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ce_formulas_name on public.ce_formulas(formula_name);
create index if not exists idx_ce_formulas_category on public.ce_formulas(category);

-- 3) INFO PAGES
create table if not exists public.ce_info_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  page_type text default 'info',
  summary text,
  body_md text,
  sections jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  audience text default 'all',
  display_order int default 0,
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ce_info_pages_slug on public.ce_info_pages(slug);
create index if not exists idx_ce_info_pages_type on public.ce_info_pages(page_type);

-- 4) ENGINE REGISTRY
create table if not exists public.ce_engine_registry (
  id uuid primary key default gen_random_uuid(),
  engine_key text unique not null,
  engine_name text not null,
  layer text,
  description text,
  purpose text,
  input_objects jsonb default '[]'::jsonb,
  output_objects jsonb default '[]'::jsonb,
  status text default 'active',
  version text default 'v1',
  notes text,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ce_engine_registry_key on public.ce_engine_registry(engine_key);
create index if not exists idx_ce_engine_registry_layer on public.ce_engine_registry(layer);

-- Featured/published views
create or replace view public.ce_glossary_featured as
select * from public.ce_glossary where is_featured = true order by display_order, term;

create or replace view public.ce_formulas_featured as
select * from public.ce_formulas where is_featured = true order by display_order, formula_name;

create or replace view public.ce_info_pages_published as
select * from public.ce_info_pages where is_published = true order by display_order, title;

create or replace view public.ce_engine_registry_active as
select * from public.ce_engine_registry where status = 'active' order by display_order, engine_name;
