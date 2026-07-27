-- JIJIN-BETA：把「可兑换人数」从 50 改为 10，并按实际绑定人数校正 used_count
update public.invite_codes
set max_uses = 10
where code = 'JIJIN-BETA';

update public.invite_codes ic
set used_count = sub.cnt
from (
  select count(*)::int as cnt
  from public.profiles p
  where p.invite_code = 'JIJIN-BETA'
) sub
where ic.code = 'JIJIN-BETA';
