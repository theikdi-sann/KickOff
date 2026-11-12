-- 0036_venue_views — recreate order_receipt_view against venues.
--
-- 0035 dropped the view together with matches.venue. The output columns are
-- unchanged (venue is now venues.name), so every consumer — the receipt edge
-- function, admin CSV paths — keeps working without edits.

create view public.order_receipt_view as
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
  v.name as venue,
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
join public.venues v on v.id = m.venue_id
left join public.order_seats os on os.order_id = o.id
group by o.id, p.full_name, p.email, m.opponent, m.kickoff_at, v.name;

grant select on public.order_receipt_view to authenticated;
