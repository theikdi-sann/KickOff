-- 0017_rls_commerce — customers read only their own commerce rows.
-- All writes happen through security-definer RPCs or the service role.
alter table public.orders enable row level security;
alter table public.order_seats enable row level security;
alter table public.tickets enable row level security;
alter table public.seat_holds enable row level security;
alter table public.device_tokens enable row level security;

create policy orders_select_own on public.orders
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy order_seats_select_own on public.order_seats
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_seats.order_id and o.user_id = auth.uid()
  )
);

create policy tickets_select_own on public.tickets
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy seat_holds_select_own on public.seat_holds
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy device_tokens_select_own on public.device_tokens
for select to authenticated using (user_id = auth.uid());
create policy device_tokens_insert_own on public.device_tokens
for insert to authenticated with check (user_id = auth.uid());
create policy device_tokens_update_own on public.device_tokens
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy device_tokens_delete_own on public.device_tokens
for delete to authenticated using (user_id = auth.uid());

grant select on public.orders, public.order_seats, public.tickets, public.seat_holds to authenticated;
grant select, insert, update, delete on public.device_tokens to authenticated;
