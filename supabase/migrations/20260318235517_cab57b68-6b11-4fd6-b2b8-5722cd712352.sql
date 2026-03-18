-- 1) Add missing FK indexes across real tables only
do $$
declare
  r record;
  v_index_name text;
  v_index_sql text;
begin
  for r in
    with fk_cols as (
      select
        ns.nspname as schema_name,
        tbl.relname as table_name,
        att.attname as column_name
      from pg_constraint con
      join pg_class tbl on tbl.oid = con.conrelid
      join pg_namespace ns on ns.oid = tbl.relnamespace
      join unnest(con.conkey) with ordinality as ck(attnum, ord) on true
      join pg_attribute att on att.attrelid = tbl.oid and att.attnum = ck.attnum
      where con.contype = 'f'
        and ns.nspname = 'public'
        and tbl.relkind in ('r', 'p')
    )
    select distinct * from fk_cols
  loop
    v_index_name := format('idx_%s_%s', r.table_name, r.column_name);
    if length(v_index_name) > 60 then
      v_index_name := substr(v_index_name, 1, 60);
    end if;
    if not exists (
      select 1 from pg_indexes i
      where i.schemaname = r.schema_name
        and i.tablename = r.table_name
        and i.indexdef ilike '%' || quote_ident(r.column_name) || '%'
    ) then
      v_index_sql := format(
        'create index if not exists %I on %I.%I (%I);',
        v_index_name, r.schema_name, r.table_name, r.column_name
      );
      execute v_index_sql;
    end if;
  end loop;
end $$;