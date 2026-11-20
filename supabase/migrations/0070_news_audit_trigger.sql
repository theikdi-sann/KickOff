-- NFR-05 — the news audit row is written by the database, not the browser.
--
-- The console used to write `news.create/update/delete` from the mutation
-- hook. A tab that closes between the row write and the audit call leaves a
-- published article with no record of who published it. The trigger moves the
-- audit into the same transaction as the news write, so it cannot be lost.

create or replace function public.audit_news_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_tenant uuid;
  v_id text;
  v_title text;
  v_category text;
begin
  if tg_op = 'INSERT' then
    v_action := 'news.create';
    v_tenant := new.tenant_id;
    v_id := new.id;
    v_title := new.title;
    v_category := new.category;
  elsif tg_op = 'UPDATE' then
    v_action := 'news.update';
    v_tenant := new.tenant_id;
    v_id := new.id;
    v_title := new.title;
    v_category := new.category;
  else
    v_action := 'news.delete';
    v_tenant := old.tenant_id;
    v_id := old.id;
    v_title := old.title;
    v_category := old.category;
  end if;

  insert into public.audit_logs
    (actor_id, tenant_id, action, entity, entity_id, metadata)
  values
    (auth.uid(), v_tenant, v_action, 'news_items', v_id,
     jsonb_build_object('title', v_title, 'category', v_category));

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists news_items_audit on public.news_items;
create trigger news_items_audit
after insert or update or delete on public.news_items
for each row execute function public.audit_news_change();

notify pgrst, 'reload schema';
