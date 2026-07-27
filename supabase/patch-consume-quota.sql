-- 扣次不再强制要求 invite_code（管理员可无码；普通用户仍由前端拦截）
create or replace function public.consume_quota(p_amount int default 1)
returns table (ok boolean, remaining int, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    return query select false, 0, '未登录'::text;
    return;
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    return query select false, 0, '用户资料不存在'::text;
    return;
  end if;

  if v_profile.quota_used + p_amount > v_profile.quota_limit then
    return query select false,
      greatest(v_profile.quota_limit - v_profile.quota_used, 0),
      '内测额度已用完'::text;
    return;
  end if;

  update public.profiles
  set quota_used = quota_used + p_amount, updated_at = now()
  where id = v_uid;

  return query select true,
    v_profile.quota_limit - v_profile.quota_used - p_amount,
    'ok'::text;
end;
$$;
