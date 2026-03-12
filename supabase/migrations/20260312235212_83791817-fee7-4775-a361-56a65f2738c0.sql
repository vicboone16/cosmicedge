alter table public.app_handshake rename column created_at to created_at_old;
alter table public.app_handshake add column created_at timestamp with time zone not null default now();
update public.app_handshake set created_at = created_at_old where created_at_old is not null;
alter table public.app_handshake drop column created_at_old;