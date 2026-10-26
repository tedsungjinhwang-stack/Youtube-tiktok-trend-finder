-- pint.kr 채널팩 → 에셋 채널 갱신 (DB 안에서 pint 공개 주소를 직접 부른다. http 확장 필요)
--
-- 갱신할 때 (요청이 있을 때 한 번씩):
--   select ops.pint_refresh_packs();   -- 팩 목록 받기 = 새 회차 시작
--   select ops.pint_sync();            -- 남은 팩이 0 이 될 때까지 반복 (한 번에 약 30초어치)
--   select name, folder_name, received, created, moved, updated, alive, error from ops.pint_pack order by pint_order;
--
-- 규칙
--  - 팩마다 같은 이름의 폴더 (ops.pint_folder_alias 에 적힌 건 그 폴더로)
--  - 새 채널은 레퍼런스로. 60일 넘게 업로드가 없으면 꺼 둔 채로 (isActive = false)
--    → 수집기(lib/radar/collect)가 100만+ 영상만 과거 트래픽(PastHit)에 남기고 채널을 지운다
--  - 과거 트래픽으로 보낸 채널(ArchivedChannel)은 다시 넣지 않는다. 업로드를 다시 시작했으면 되살린다
--  - 시스템 폴더(__로 시작)에 있던 채널은 팩 폴더로 옮긴다
--  - 팩 폴더 채널은 이름·썸네일·구독자·형식·하루 조회수·마지막 업로드·켜짐을 갱신
--  - 다른 폴더로 분류해 둔 채널은 폴더·켜짐을 건드리지 않는다
--  - 넘사·고래처럼 주제가 섞인 팩은 나중에 넣는다 (채널이 주제 폴더로 먼저 가게)

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
comment on schema ops is '관리용 (앱·외부 API에 노출하지 않음). pint 채널팩 갱신 등';

create table if not exists ops.pint_pack (
  pack_id      text primary key,
  name         text not null,
  folder_name  text not null,
  description  text,
  item_count   int,
  pint_order   int,
  priority     int not null default 0,
  listed_at    timestamptz,
  attempted_at timestamptz,
  synced_at    timestamptz,
  received int, created int, moved int, updated int, alive int,
  error text
);

create table if not exists ops.pint_folder_alias (
  pack_name   text primary key,
  folder_name text not null
);
insert into ops.pint_folder_alias values
  ('예능짜집기', '한국 예능'),
  ('예능짜집기 | 해외', '해외 예능'),
  ('커뮤형 | 영드짜', '영드짜 | 커뮤형'),
  ('해짜 (동물)', '해짜 | 동물'),
  ('해짜 (음악)', '해짜 | 음악')
on conflict (pack_name) do update set folder_name = excluded.folder_name;

create or replace function ops.pint_get(p_path text) returns jsonb
language plpgsql as $$
declare r extensions.http_response;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  select * into r from extensions.http((
    'GET', 'https://pint.kr' || p_path,
    array[
      extensions.http_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'),
      extensions.http_header('Accept', 'application/json')
    ], null, null)::extensions.http_request);
  if r.status <> 200 then
    raise exception 'pint HTTP % (%)', r.status, p_path;
  end if;
  return r.content::jsonb;
end $$;

create or replace function ops.pint_refresh_packs() returns int
language plpgsql as $$
declare
  j jsonb; f jsonb; i int := 0; n int := 0; nm text;
  meta text[] := array['넘사','고래','No양산형','주제 자주 변경','제외','대기업','방송사 채널팩','뉴스공식','저작권ㄱㅊ?'];
begin
  j := ops.pint_get('/api/watchlist/folders?kind=channel&include_sample=1&include_counts=1');
  for f in select * from jsonb_array_elements(j->'folders') loop
    i := i + 1;
    if not (coalesce(f->>'id', '') like 'tmpl\_%' or f->>'id' = 'sample') then continue; end if;
    nm := trim(f->>'name');
    insert into ops.pint_pack (pack_id, name, folder_name, description, item_count, pint_order, priority, listed_at)
    values (
      f->>'id', nm,
      coalesce((select a.folder_name from ops.pint_folder_alias a where a.pack_name = nm), nm),
      nullif(f->>'description', ''), (f->>'itemCount')::int, i,
      case when nm = any (meta) then 1 else 0 end,
      now())
    on conflict (pack_id) do update set
      name = excluded.name, folder_name = excluded.folder_name, description = excluded.description,
      item_count = excluded.item_count, pint_order = excluded.pint_order, priority = excluded.priority,
      listed_at = excluded.listed_at;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function ops.pint_sync_pack(p_pack_id text, p_dead_days int default 60) returns jsonb
language plpgsql as $$
declare
  pk ops.pint_pack;
  j jsonb; pg int := 0; v_folder text;
  items jsonb := '[]'::jsonb;
  v_received int; v_alive int; v_created int; v_moved int; v_updated int;
  cutoff timestamptz := now() - make_interval(days => p_dead_days);
begin
  select * into pk from ops.pint_pack where pack_id = p_pack_id;
  if pk.pack_id is null then raise exception '팩 없음: %', p_pack_id; end if;
  update ops.pint_pack set attempted_at = clock_timestamp(), error = null where pack_id = p_pack_id;

  loop
    j := ops.pint_get(format('/api/watchlist/v2/channels?folder_id=%s&page=%s&limit=100', p_pack_id, pg));
    items := items || coalesce(j->'items', '[]'::jsonb);
    exit when not coalesce((j->'pagination'->>'hasMore')::boolean, false) or pg >= 49;
    pg := pg + 1;
    perform pg_sleep(0.3);
  end loop;

  select id into v_folder from "Folder" where name = pk.folder_name;
  if v_folder is null then
    insert into "Folder" (id, name, "sortOrder", description, "updatedAt")
    values ('f' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), pk.folder_name,
            (select coalesce(max("sortOrder"), 0) + 1 from "Folder"), pk.description, now())
    returning id into v_folder;
  else
    update "Folder" set description = coalesce(description, pk.description) where id = v_folder;
  end if;

  with r as (
    select distinct on (c->>'youtubeChannelId')
      c->>'youtubeChannelId' as yt,
      nullif(trim(c->>'title'), '') as title,
      nullif(c->>'thumbnailUrl', '') as thumb,
      least((c->>'subscriberCount')::numeric, 2147483647)::int as subs,
      least((c->>'dailyViews')::numeric, 2147483647)::int as daily,
      nullif(c->>'contentFormat', '') as fmt,
      (c->>'lastUploadAt')::timestamptz as last_upload
    from jsonb_array_elements(items) it
    cross join lateral (select it->'channel' as c) x
    where coalesce(c->>'youtubeChannelId', '') ~ '^UC[A-Za-z0-9_-]{22}$'
  ), ins as (
    insert into "Channel" (id, platform, "externalId", "displayName", "thumbnailUrl", "subscriberCount",
                           "dailyViews", "contentFormat", "lastUploadAt", "folderId", "isActive", kind)
    select 'c' || substr(md5(random()::text || r.yt || clock_timestamp()::text), 1, 24), 'YOUTUBE'::"Platform",
           r.yt, r.title, r.thumb, r.subs, r.daily, r.fmt, r.last_upload, v_folder,
           coalesce(r.last_upload >= cutoff, false), 'REFERENCE'
    from r
    where not exists (
      -- 과거 트래픽으로 보낸 채널은 다시 넣지 않는다 (업로드를 다시 시작했으면 되살린다)
      select 1 from "ArchivedChannel" a
      where a."externalId" = r.yt and not coalesce(r.last_upload >= cutoff, false)
    )
    on conflict (platform, "externalId") do nothing
    returning 1
  ), revived as (
    delete from "ArchivedChannel" a using r
    where a."externalId" = r.yt and r.last_upload >= cutoff
    returning 1
  ), mv as (
    -- 시스템 폴더에 있던 채널 → 팩 폴더로
    update "Channel" c set
      "folderId" = v_folder,
      "displayName" = coalesce(r.title, c."displayName"),
      "thumbnailUrl" = coalesce(r.thumb, c."thumbnailUrl"),
      "subscriberCount" = coalesce(r.subs, c."subscriberCount"),
      "dailyViews" = coalesce(c."dailyViews", r.daily),
      "contentFormat" = coalesce(r.fmt, c."contentFormat"),
      "lastUploadAt" = coalesce(r.last_upload, c."lastUploadAt"),
      "isActive" = coalesce(r.last_upload >= cutoff, false)
    from r, "Folder" f
    where c.platform = 'YOUTUBE' and c."externalId" = r.yt
      and f.id = c."folderId" and f.name like '\_\_%' and c."folderId" <> v_folder
    returning 1
  ), up as (
    -- 팩 폴더 채널 갱신 (하루 조회수는 수집기가 기록으로 낸 값이 있으면 그걸 둔다)
    update "Channel" c set
      "displayName" = coalesce(r.title, c."displayName"),
      "thumbnailUrl" = coalesce(r.thumb, c."thumbnailUrl"),
      "subscriberCount" = coalesce(r.subs, c."subscriberCount"),
      "dailyViews" = case when cardinality(c."viewHistory") >= 2 then c."dailyViews" else coalesce(r.daily, c."dailyViews") end,
      "contentFormat" = coalesce(r.fmt, c."contentFormat"),
      "lastUploadAt" = greatest(r.last_upload, c."lastUploadAt"),
      "isActive" = coalesce(greatest(r.last_upload, c."lastUploadAt") >= cutoff, false)
    from r
    where c.platform = 'YOUTUBE' and c."externalId" = r.yt and c."folderId" = v_folder
      and (c."isActive" is distinct from coalesce(greatest(r.last_upload, c."lastUploadAt") >= cutoff, false)
        or c."subscriberCount" is distinct from coalesce(r.subs, c."subscriberCount")
        or c."displayName" is distinct from coalesce(r.title, c."displayName")
        or c."thumbnailUrl" is distinct from coalesce(r.thumb, c."thumbnailUrl")
        or c."contentFormat" is distinct from coalesce(r.fmt, c."contentFormat")
        or c."lastUploadAt" is distinct from greatest(r.last_upload, c."lastUploadAt"))
    returning 1
  ), other as (
    -- 다른 폴더로 분류해 둔 채널은 구독자·썸네일·형식만
    update "Channel" c set
      "subscriberCount" = coalesce(r.subs, c."subscriberCount"),
      "thumbnailUrl" = coalesce(r.thumb, c."thumbnailUrl"),
      "contentFormat" = coalesce(c."contentFormat", r.fmt)
    from r, "Folder" f
    where c.platform = 'YOUTUBE' and c."externalId" = r.yt and c."folderId" <> v_folder
      and f.id = c."folderId" and f.name not like '\_\_%'
      and (c."subscriberCount" is distinct from coalesce(r.subs, c."subscriberCount")
        or c."thumbnailUrl" is distinct from coalesce(r.thumb, c."thumbnailUrl")
        or (c."contentFormat" is null and r.fmt is not null))
    returning 1
  )
  select (select count(*) from r), (select count(*) from r where last_upload >= cutoff),
         (select count(*) from ins), (select count(*) from mv), (select count(*) from up)
  into v_received, v_alive, v_created, v_moved, v_updated
  from (select count(*) from other) o, (select count(*) from revived) rv;

  update ops.pint_pack set
    synced_at = clock_timestamp(), received = v_received, created = v_created,
    moved = v_moved, updated = v_updated, alive = v_alive, error = null
  where pack_id = p_pack_id;

  return jsonb_build_object('pack', pk.name, 'folder', pk.folder_name, 'received', v_received,
    'created', v_created, 'moved', v_moved, 'updated', v_updated, 'alive', v_alive);
end $$;

create or replace function ops.pint_sync(p_dead_days int default 60, p_budget_seconds int default 30) returns jsonb
language plpgsql as $$
declare
  t0 timestamptz := clock_timestamp();
  round_at timestamptz;
  pk record;
  done jsonb := '[]'::jsonb;
  remaining int;
begin
  select max(listed_at) into round_at from ops.pint_pack;
  for pk in
    select pack_id, name from ops.pint_pack
    where listed_at = round_at and (attempted_at is null or attempted_at < round_at)
    order by priority, pint_order
  loop
    exit when clock_timestamp() - t0 > make_interval(secs => p_budget_seconds);
    begin
      done := done || jsonb_build_array(ops.pint_sync_pack(pk.pack_id, p_dead_days));
    exception when others then
      update ops.pint_pack set attempted_at = clock_timestamp(), error = sqlerrm where pack_id = pk.pack_id;
      done := done || jsonb_build_array(jsonb_build_object('pack', pk.name, 'error', sqlerrm));
    end;
  end loop;
  select count(*) into remaining from ops.pint_pack
  where listed_at = round_at and (attempted_at is null or attempted_at < round_at);
  return jsonb_build_object('done', done, 'remaining', remaining,
    'seconds', round(extract(epoch from clock_timestamp() - t0)::numeric, 1));
end $$;

revoke all on all functions in schema ops from public, anon, authenticated;
revoke all on all tables in schema ops from public, anon, authenticated;
