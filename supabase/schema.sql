-- 基今 · 内测：邀请码 / 配额 / 基金重仓缓存 / 股票简介
-- 在 Supabase Dashboard → SQL Editor 中整段执行

-- 邀请码
create table if not exists public.invite_codes (
  code text primary key,
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  quota_limit int not null default 10 check (quota_limit > 0),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

-- 用户资料（配额）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  invite_code text references public.invite_codes (code),
  quota_limit int not null default 10,
  quota_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 基金基础信息
create table if not exists public.funds (
  code text primary key,
  name text not null,
  fund_type text,
  asset_class text,
  updated_at timestamptz not null default now()
);

-- 基金十大重仓（按报告期）
create table if not exists public.fund_top_holdings (
  fund_code text not null references public.funds (code) on delete cascade,
  report_date text not null,
  stock_code text not null,
  stock_name text not null,
  weight numeric not null default 0,
  industry text,
  rank int not null default 0,
  primary key (fund_code, report_date, stock_code)
);

create index if not exists fund_top_holdings_fund_date_idx
  on public.fund_top_holdings (fund_code, report_date);

-- 股票与简介缓存
create table if not exists public.stocks (
  code text primary key,
  name text not null,
  industry text,
  brief text,
  brief_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 新用户自动建 profile（无邀请码时先用默认配额，登录后由 redeem 覆盖）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 校验并预占邀请码（发 Magic Link 前调用）
create or replace function public.validate_invite_code(p_code text)
returns table (ok boolean, quota_limit int, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invite_codes%rowtype;
begin
  select * into v_row
  from public.invite_codes
  where upper(code) = upper(trim(p_code));

  if not found then
    return query select false, 0, '邀请码无效'::text;
    return;
  end if;

  if not v_row.active then
    return query select false, 0, '邀请码已停用'::text;
    return;
  end if;

  if v_row.used_count >= v_row.max_uses then
    return query select false, 0, '邀请码已用完'::text;
    return;
  end if;

  return query select true, v_row.quota_limit, 'ok'::text;
end;
$$;

-- 登录后兑换邀请码并写入配额
create or replace function public.redeem_invite_code(p_code text)
returns table (ok boolean, quota_limit int, quota_used int, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.invite_codes%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    return query select false, 0, 0, '未登录'::text;
    return;
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if found and v_profile.invite_code is not null then
    return query select true, v_profile.quota_limit, v_profile.quota_used, '已绑定邀请码'::text;
    return;
  end if;

  select * into v_row
  from public.invite_codes
  where upper(code) = upper(trim(p_code))
  for update;

  if not found or not v_row.active or v_row.used_count >= v_row.max_uses then
    return query select false, 0, 0, '邀请码不可用'::text;
    return;
  end if;

  update public.invite_codes
  set used_count = used_count + 1
  where code = v_row.code;

  insert into public.profiles (id, email, invite_code, quota_limit, quota_used)
  values (
    v_uid,
    (select email from auth.users where id = v_uid),
    v_row.code,
    v_row.quota_limit,
    0
  )
  on conflict (id) do update
  set
    invite_code = excluded.invite_code,
    quota_limit = excluded.quota_limit,
    updated_at = now();

  return query
  select true, v_row.quota_limit, 0, '兑换成功'::text;
end;
$$;

-- 扣减配额（action 仅作备注扩展）
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

  -- 邀请码由应用层校验；此处只扣额度（管理员可无邀请码）
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

alter table public.invite_codes enable row level security;
alter table public.profiles enable row level security;
alter table public.funds enable row level security;
alter table public.fund_top_holdings enable row level security;
alter table public.stocks enable row level security;

-- profiles：本人可读写
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id);

-- 邀请码：登录用户仅可校验（通过 RPC）；表本身不对 anon 开放明细
drop policy if exists invite_codes_no_direct on public.invite_codes;
-- 无直读策略：仅 security definer 函数可访问

-- 基金/重仓/股票：登录可读
drop policy if exists funds_select_auth on public.funds;
create policy funds_select_auth on public.funds
  for select to authenticated using (true);

drop policy if exists fund_top_holdings_select_auth on public.fund_top_holdings;
create policy fund_top_holdings_select_auth on public.fund_top_holdings
  for select to authenticated using (true);

drop policy if exists stocks_select_auth on public.stocks;
create policy stocks_select_auth on public.stocks
  for select to authenticated using (true);

-- 写入由 service role 完成（服务端缓存），不开放 authenticated insert

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select on public.funds, public.fund_top_holdings, public.stocks to authenticated;
grant execute on function public.validate_invite_code(text) to anon, authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;
grant execute on function public.consume_quota(int) to authenticated;

-- 内测邀请码：max_uses = 可兑换人数；quota_limit = 每人分析次数
insert into public.invite_codes (code, max_uses, quota_limit, note)
values ('JIJIN-BETA', 10, 10, '内测通用邀请码')
on conflict (code) do update
set quota_limit = excluded.quota_limit,
    note = excluded.note;
