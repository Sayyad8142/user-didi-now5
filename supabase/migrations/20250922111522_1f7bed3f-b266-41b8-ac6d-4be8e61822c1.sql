-- Allow admins to reassign workers to already assigned bookings
CREATE OR REPLACE FUNCTION public.assign_worker_to_booking(p_booking_id uuid, p_worker_id uuid, p_assigned_by uuid DEFAULT NULL::uuid)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_b public.bookings;
  v_w public.workers;
  v_minutes int;
begin
  if not public.is_admin() then
    raise exception 'Access denied (admin only)' using errcode = '42501';
  end if;

  -- Lock row to avoid double-assign
  select * into v_b
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  -- Allow reassignment for pending and assigned bookings (admin can reassign)
  if v_b.status NOT IN ('pending', 'assigned') then
    raise exception 'Cannot assign worker to booking with status: %', v_b.status;
  end if;

  -- Get worker details
  select * into v_w from public.workers where id = p_worker_id;
  if not found then 
    raise exception 'Worker not found';
  end if;

  -- Compute minutes per service with fallback 45
  v_minutes := public.get_setting_int('auto_complete_after_minutes.' || v_b.service_type, 45);

  update public.bookings
  set status = 'assigned',
      assigned_at = coalesce(assigned_at, now()),
      worker_id = p_worker_id,
      worker_name = v_w.full_name,
      worker_phone = v_w.phone,
      worker_upi = v_w.upi_id,
      worker_photo_url = v_w.photo_url,
      pay_enabled_at = coalesce(pay_enabled_at, now() + interval '30 minutes'),
      auto_complete_after_minutes = v_minutes,
      auto_complete_at = now() + (v_minutes || ' minutes')::interval,
      updated_at = now()
  where id = p_booking_id
  returning * into v_b;

  return v_b;
end
$function$;