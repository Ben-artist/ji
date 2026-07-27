-- 若已执行过旧 schema，在 SQL Editor 再跑这段把额度改为 10
update public.invite_codes
set quota_limit = 10
where code = 'JIJIN-BETA';

alter table public.invite_codes
  alter column quota_limit set default 10;

alter table public.profiles
  alter column quota_limit set default 10;

-- 已绑定用户的总额度也改为 10（已用次数保留，剩余可能变少）
update public.profiles
set quota_limit = 10
where invite_code = 'JIJIN-BETA';
