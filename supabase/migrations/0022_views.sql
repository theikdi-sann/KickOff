-- 0022_views — availability and reporting.
create or replace view public.zone_availability as
select
  s.zone_id,
  count(*) as total_seats,
  count(*) filter (
    where s.status = 'available'
      and not exists (
        select 1 from public.seat_holds h
        where h.seat_id = s.id
          and h.released_at is null
          and h.expires_at > now()
      )
      and not exists (
        select 1
        from public.order_seats os
        join public.orders o on o.id = os.order_id
        where os.seat_id = s.id and o.status = 'pending'
      )
  ) as available_seats
from public.seats s
group by s.zone_id;

create or replace view public.match_sales_summary as
select
  m.id as match_id,
  count(distinct o.id) filter (where o.status = 'paid') as orders_paid,
  coalesce(sum(os.price_satang) filter (where o.status = 'paid'), 0) as revenue_satang,
  count(os.id) filter (where o.status = 'paid') as tickets_sold
from public.matches m
left join public.orders o on o.match_id = m.id
left join public.order_seats os on os.order_id = o.id
group by m.id;

create or replace view public.order_receipt_view as
select
  o.id as order_id,
  o.user_id,
  o.match_id,
  o.amount_satang,
  o.status,
  o.created_at,
  o.paid_at,
  o.payment_ref,
  p.full_name as holder,
  p.email as holder_email,
  m.opponent,
  m.kickoff_at,
  m.venue,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seatId', os.seat_id,
        'ticketId', os.ticket_id,
        'zoneName', os.zone_name,
        'row', os.row_label,
        'number', os.number,
        'priceSatang', os.price_satang
      )
      order by os.zone_name, os.row_label, os.number
    ) filter (where os.id is not null),
    '[]'::jsonb
  ) as seats
from public.orders o
join public.profiles p on p.id = o.user_id
join public.matches m on m.id = o.match_id
left join public.order_seats os on os.order_id = o.id
group by o.id, p.full_name, p.email, m.opponent, m.kickoff_at, m.venue;

grant select on public.zone_availability to anon, authenticated;
grant select on public.match_sales_summary, public.order_receipt_view to authenticated;
