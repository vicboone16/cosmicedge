create extension if not exists pgcrypto;

create or replace function public._create_index_if_missing(
  p_table_schema text,
  p_table_name text,
  p_index_name text,
  p_index_sql text
)
returns void
language plpgsql
as $$
declare
  v_relkind "char";
begin
  select c.relkind
    into v_relkind
  from pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = p_table_schema
    and c.relname = p_table_name
  limit 1;

  if v_relkind not in ('r', 'p') then
    return;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = p_table_schema
      and tablename = p_table_name
      and indexname = p_index_name
  ) then
    execute p_index_sql;
  end if;
end;
$$;