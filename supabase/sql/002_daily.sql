-- Stylish 서버 데이터: 오늘의 유형 맞히기 전체 통계(3단계)
-- Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run. (여러 번 실행해도 되게 만들었다)
--
-- 보안 원칙 (001과 같음)
--  · 표는 RLS를 켜고 정책을 두지 않는다 → 브라우저는 표를 직접 읽고 쓸 수 없다
--  · 결과 올리기는 로그인(익명 로그인 + Turnstile)한 사용자만, 하루 한 번(익명 ID당 첫 결과만)
--  · 통계 보기는 누구나. 개인 정보는 저장하지 않는다(익명 ID·문제 번호·시도 횟수·성공 여부뿐)

-- 문제 번호(day): 2026-10-16(한국 시간)을 0번으로, 한국 시간 자정마다 1씩 늘어난다
create or replace function public.daily_today() returns int
language sql stable set search_path = public as $$
  select ((now() at time zone 'Asia/Seoul')::date - date '2026-10-16')::int
$$;

create table if not exists public.daily_results (
  day int not null check (day >= 0),
  user_id uuid not null,
  tries smallint not null check (tries between 1 and 4),
  solved boolean not null,
  created_at timestamptz not null default now(),
  primary key (day, user_id)
);
alter table public.daily_results enable row level security;

/** 그날 통계: 참여 수, 맞힌 수, 몇 번 만에 맞혔는지 분포 [1번,2번,3번,4번] */
create or replace function public.get_daily_stats(p_day int) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'day', p_day,
    'players', count(*),
    'solved', count(*) filter (where solved),
    'dist', json_build_array(
      count(*) filter (where solved and tries = 1), count(*) filter (where solved and tries = 2),
      count(*) filter (where solved and tries = 3), count(*) filter (where solved and tries = 4))
  ) from public.daily_results where day = p_day
$$;

/** 결과 올리기: 오늘(또는 자정 직후를 위해 어제) 문제만, 익명 ID당 첫 결과만 남긴다. 올린 뒤 통계를 돌려준다 */
create or replace function public.submit_daily(p_day int, p_tries smallint, p_solved boolean) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today int := public.daily_today();
begin
  if uid is null then raise exception 'login required'; end if;
  if p_day is null or p_day not between today - 1 and today then raise exception 'bad day'; end if;
  if p_tries is null or p_tries not between 1 and 4 or p_solved is null then raise exception 'bad result'; end if;
  insert into public.daily_results(day, user_id, tries, solved) values (p_day, uid, p_tries, p_solved)
  on conflict (day, user_id) do nothing;
  return public.get_daily_stats(p_day);
end $$;

revoke all on function public.submit_daily(int, smallint, boolean) from public, anon;
revoke all on function public.get_daily_stats(int) from public;
revoke all on function public.daily_today() from public;
grant execute on function public.submit_daily(int, smallint, boolean) to authenticated;
grant execute on function public.get_daily_stats(int) to anon, authenticated;
grant execute on function public.daily_today() to anon, authenticated;

-- 90일이 지난 결과는 매일 지운다 (통계는 그날·최근에만 의미가 있다)
select cron.unschedule('stylish-daily-cleanup') where exists (select 1 from cron.job where jobname = 'stylish-daily-cleanup');
select cron.schedule('stylish-daily-cleanup', '37 3 * * *',
  $$delete from public.daily_results where created_at < now() - interval '90 days'$$);
