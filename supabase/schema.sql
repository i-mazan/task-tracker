-- Run once in Supabase SQL Editor. Every item is an independent versioned row.
begin;
create table public.taskflow_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tasks','ideas')),
  id text not null check (length(id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  position integer not null default 0,
  constraint valid_payload check (
    jsonb_typeof(payload->'text') = 'string' and coalesce(length(trim(payload->>'text')),0) > 0
    and (kind = 'ideas' or coalesce(payload->>'category','') in ('today','week','later'))
  ),
  version bigint not null default 1,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create table public.taskflow_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  result jsonb not null,
  primary key (user_id, id)
);
alter table public.taskflow_items enable row level security;
alter table public.taskflow_operations enable row level security;
create policy own_items on public.taskflow_items for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.taskflow_items, public.taskflow_operations from anon, authenticated;
grant select on public.taskflow_items to authenticated;

-- All writes go through this transaction. Serialize per account, check versions,
-- and retain operation receipts so retrying after a lost response is safe.
create function public.taskflow_apply(operation_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  receipt jsonb;
  change jsonb;
  item public.taskflow_items;
  conflicts jsonb := '[]'::jsonb;
  rows jsonb := '[]'::jsonb;
  expected bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if changes is null or jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) = 0 or jsonb_array_length(changes) > 10000 then
    raise exception 'Invalid change batch';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select result into receipt from public.taskflow_operations where user_id = uid and id = operation_id;
  if found then return receipt; end if;
  if exists (select 1 from jsonb_array_elements(changes) c group by c->>'kind', c->>'id' having count(*) > 1) then
    raise exception 'Duplicate item in batch';
  end if;
  for change in select value from jsonb_array_elements(changes) loop
    if coalesce(change->>'kind','') not in ('tasks','ideas') or coalesce(length(change->>'id'),0) not between 1 and 200 then
      raise exception 'Invalid item';
    end if;
    expected := (change->>'base')::bigint;
    if expected is null or expected < 0 then raise exception 'Invalid version'; end if;
    select * into item from public.taskflow_items where user_id = uid and kind = change->>'kind' and id = change->>'id';
    if coalesce(item.version,0) <> expected then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('kind',change->>'kind','id',change->>'id','server',case when item.id is null then 'null'::jsonb else to_jsonb(item) end));
    end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object('ok',false,'conflicts',conflicts);
  end if;
  for change in select value from jsonb_array_elements(changes) loop
    insert into public.taskflow_items(user_id,kind,id,payload,position,version,deleted)
    values(uid,change->>'kind',change->>'id',coalesce(change->'payload','{}'::jsonb),coalesce((change->>'position')::integer,0),1,coalesce((change->>'deleted')::boolean,false))
    on conflict (user_id,kind,id) do update set payload=excluded.payload,position=excluded.position,
      version=taskflow_items.version+1,deleted=excluded.deleted,updated_at=now()
    returning * into item;
    rows := rows || jsonb_build_array(to_jsonb(item));
  end loop;
  receipt := jsonb_build_object('ok',true,'rows',rows);
  insert into public.taskflow_operations values(uid,operation_id,receipt);
  return receipt;
end $$;
revoke all on function public.taskflow_apply(uuid,jsonb) from public, anon;
grant execute on function public.taskflow_apply(uuid,jsonb) to authenticated;
create or replace function public.taskflow_acknowledge(operation_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if operation_ids is null or coalesce(cardinality(operation_ids),0) > 1000 then
    raise exception 'Invalid receipt batch';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  delete from public.taskflow_operations
    where user_id = uid and id = any(operation_ids);
end $$;
revoke all on function public.taskflow_acknowledge(uuid[]) from public, anon;
grant execute on function public.taskflow_acknowledge(uuid[]) to authenticated;
alter publication supabase_realtime add table public.taskflow_items;
commit;
