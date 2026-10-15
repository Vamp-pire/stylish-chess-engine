-- Stylish 서버 데이터: 그룹 유형 지도(5단계) + 동기화 코드(6단계)
-- Supabase 대시보드 → SQL Editor에 통째로 붙여 넣고 Run. (여러 번 실행해도 되게 만들었다)
--
-- 보안 원칙
--  · 모든 표는 RLS를 켜고 정책을 두지 않는다 → 브라우저(anon·authenticated)는 표를 직접 읽고 쓸 수 없다
--  · 읽기·쓰기는 아래 함수(RPC)로만. 함수가 길이·금칙어·인원·본인 여부를 검사한다
--  · 쓰기 함수는 로그인(익명 로그인 + Turnstile 확인)한 사용자만, 그룹 보기는 누구나(링크 미리보기용)

create extension if not exists pgcrypto with schema extensions;

-- ───────────── 금칙어 (그룹 이름·닉네임에만 검사, 체스 아이디는 실제 아이디라 검사 안 함) ─────────────
create table if not exists public.banned_words (word text primary key);
alter table public.banned_words enable row level security;
insert into public.banned_words(word) values
  ('시발'),('씨발'),('씨빨'),('ㅅㅂ'),('병신'),('ㅂㅅ'),('좆'),('개새끼'),('새끼'),('니애미'),('느금'),('엠창'),('애미'),('애비'),
  ('섹스'),('보지'),('자지'),('창녀'),('걸레'),('운영자'),('관리자'),
  ('fuck'),('shit'),('bitch'),('cunt'),('nigg'),('fag'),('retard'),('porn'),('admin'),('moderator')
on conflict do nothing;

create or replace function public.has_banned_word(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.banned_words b
    where position(b.word in lower(regexp_replace(coalesce(t, ''), '[\s._\-]', '', 'g'))) > 0
  )
$$;

-- ───────────── 그룹 ─────────────
create table if not exists public.groups (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 30),
  owner uuid not null,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;
create index if not exists groups_owner_idx on public.groups(owner, created_at);

create table if not exists public.group_members (
  group_code text not null references public.groups(code) on delete cascade,
  user_id uuid not null,
  chess_source text not null check (chess_source in ('lichess', 'chesscom', 'pgn')),
  chess_id text not null check (char_length(chess_id) between 1 and 40),
  nickname text check (nickname is null or char_length(nickname) between 1 and 16),
  type_code text check (type_code is null or type_code ~ '^[AP][WS][IR][OE]$'),
  pcts smallint[] check (pcts is null or array_length(pcts, 1) = 4),
  counted int not null default 0 check (counted >= 0),
  updated_at timestamptz not null default now(),
  primary key (group_code, user_id)
);
alter table public.group_members enable row level security;
create index if not exists group_members_user_idx on public.group_members(user_id);

-- 그룹 만들기: 6자리 코드를 돌려준다. 한 사용자당 하루 5개까지
create or replace function public.create_group(p_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  i int;
begin
  if v_uid is null then raise exception 'login required'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 1 and 30 then raise exception 'name length'; end if;
  if public.has_banned_word(p_name) then raise exception 'banned word'; end if;
  if (select count(*) from public.groups where owner = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many groups';
  end if;
  for i in 1..10 loop
    -- 헷갈리는 글자(I·O·0·1)를 뺀 32글자
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1), '')
      into v_code from generate_series(1, 6);
    begin
      insert into public.groups(code, name, owner) values (v_code, p_name, v_uid);
      return v_code;
    exception when unique_violation then
      -- 코드가 겹치면 다시
    end;
  end loop;
  raise exception 'could not create code';
end $$;

-- 그룹에 들어가거나 내 유형 갱신 (같은 사용자 = 같은 브라우저만 자기 항목 수정). 그룹당 200명까지
create or replace function public.upsert_group_member(
  p_code text, p_source text, p_chess_id text, p_nickname text, p_type text, p_pcts smallint[], p_counted int
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'login required'; end if;
  p_code := upper(btrim(coalesce(p_code, '')));
  if not exists (select 1 from public.groups where code = p_code) then raise exception 'no group'; end if;
  p_nickname := nullif(btrim(coalesce(p_nickname, '')), '');
  if p_nickname is not null and (char_length(p_nickname) > 16 or public.has_banned_word(p_nickname)) then
    raise exception 'bad nickname';
  end if;
  if not exists (select 1 from public.group_members where group_code = p_code and user_id = v_uid)
     and (select count(*) from public.group_members where group_code = p_code) >= 200 then
    raise exception 'group full';
  end if;
  insert into public.group_members(group_code, user_id, chess_source, chess_id, nickname, type_code, pcts, counted, updated_at)
  values (p_code, v_uid, p_source, btrim(p_chess_id), p_nickname, p_type, p_pcts, coalesce(p_counted, 0), now())
  on conflict (group_code, user_id) do update set
    chess_source = excluded.chess_source, chess_id = excluded.chess_id, nickname = excluded.nickname,
    type_code = excluded.type_code, pcts = excluded.pcts, counted = excluded.counted, updated_at = now();
end $$;

-- 그룹 나가기 (자기 항목만)
create or replace function public.leave_group(p_code text) returns void
language sql security definer set search_path = public as $$
  delete from public.group_members where group_code = upper(btrim(p_code)) and user_id = auth.uid();
$$;

-- 그룹 보기: 이름은 닉네임이 있으면 닉네임, 없으면 체스 아이디. 사용자 ID는 내보내지 않고 '나인지'만
create or replace function public.get_group(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'code', g.code, 'name', g.name, 'created_at', g.created_at,
    'members', coalesce((
      select json_agg(json_build_object(
        'name', coalesce(m.nickname, m.chess_id), 'source', m.chess_source, 'type', m.type_code,
        'pcts', m.pcts, 'counted', m.counted, 'updated_at', m.updated_at, 'me', m.user_id = auth.uid()
      ) order by m.updated_at desc)
      from public.group_members m where m.group_code = g.code
    ), '[]'::json)
  )
  from public.groups g where g.code = upper(btrim(p_code))
$$;

-- ───────────── 동기화 코드 ─────────────
-- 코드 자체는 저장하지 않고 해시만. 코드를 아는 사람만 읽고 쓸 수 있다. 마지막 사용 후 30일 지나면 자동 삭제
create table if not exists public.sync_blobs (
  code_hash text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.sync_blobs enable row level security;

create or replace function public.sync_put(p_code text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if char_length(coalesce(p_code, '')) < 12 then raise exception 'bad code'; end if;
  if pg_column_size(p_data) > 2000000 then raise exception 'too large'; end if;
  insert into public.sync_blobs(code_hash, data, updated_at)
  values (encode(extensions.digest(p_code, 'sha256'), 'hex'), p_data, now())
  on conflict (code_hash) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.sync_get(p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update public.sync_blobs set updated_at = now()
    where code_hash = encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex')
    returning data into v;
  return v;
end $$;

-- ───────────── 함수 실행 권한 ─────────────
revoke all on function public.has_banned_word(text) from public, anon, authenticated;
revoke all on function public.create_group(text) from public, anon;
revoke all on function public.upsert_group_member(text, text, text, text, text, smallint[], int) from public, anon;
revoke all on function public.leave_group(text) from public, anon;
revoke all on function public.sync_put(text, jsonb) from public, anon;
revoke all on function public.sync_get(text) from public, anon;
revoke all on function public.get_group(text) from public;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.upsert_group_member(text, text, text, text, text, smallint[], int) to authenticated;
grant execute on function public.leave_group(text) to authenticated;
grant execute on function public.sync_put(text, jsonb) to authenticated;
grant execute on function public.sync_get(text) to authenticated;
grant execute on function public.get_group(text) to anon, authenticated;

-- ───────────── 자동 정리 (pg_cron, 매일 한국 시간 낮 12시 17분 = UTC 03:17) ─────────────
select cron.unschedule(jobid) from cron.job where jobname in ('stylish-sync-cleanup', 'stylish-empty-groups');
select cron.schedule('stylish-sync-cleanup', '17 3 * * *',
  $$delete from public.sync_blobs where updated_at < now() - interval '30 days'$$);
-- 만든 지 7일이 지났는데 아무도 없는 그룹은 지운다
select cron.schedule('stylish-empty-groups', '27 3 * * *',
  $$delete from public.groups g where g.created_at < now() - interval '7 days'
      and not exists (select 1 from public.group_members m where m.group_code = g.code)$$);
