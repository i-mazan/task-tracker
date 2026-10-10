-- Existing projects: run this migration once after schema.sql.
-- New projects: schema.sql already includes this function.
begin;
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
commit;
