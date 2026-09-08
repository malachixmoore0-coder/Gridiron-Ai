-- Gridiron AI — social layer schema.
--
-- Run this once in the Supabase SQL editor, then enable Google and Apple under
-- Authentication → Providers. Every privacy rule the app promises is enforced
-- here, in row-level security, not in the client: a private account's picks are
-- unreadable by a stranger even if they call the API directly.

create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text unique not null check (handle ~ '^[a-z0-9_]{3,18}$'),
  display_name text not null default '',
  bio          text not null default '' check (char_length(bio) <= 240),
  avatar_color text not null default '#12D992',
  -- Avatar and banner are stored as data: URLs rather than in a storage bucket.
  -- They are hard-capped client-side (90 KB and 260 KB before base64) so a row
  -- stays a row; anything bigger is rejected before it gets here. If you would
  -- rather use Supabase Storage, swap these for object paths — nothing else in
  -- the app cares which one a URL is.
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 200000),
  banner_url   text check (banner_url is null or char_length(banner_url) <= 400000),
  provider     text not null default 'google',
  is_private   boolean not null default false,
  show_record  boolean not null default true,
  show_picks   boolean not null default true,
  record       jsonb,
  followers    integer not null default 0,
  following    integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists follows (
  follower_id uuid not null references profiles on delete cascade,
  followee_id uuid not null references profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references profiles on delete cascade,
  text       text not null default '' check (char_length(text) <= 500),
  hashtags   text[] not null default '{}',
  gif_url    text,
  pick       jsonb,
  reply_to   uuid references posts on delete cascade,
  likes      integer not null default 0,
  tails      integer not null default 0,
  replies    integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_author_idx  on posts (author_id, created_at desc);
create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_tags_idx    on posts using gin (hashtags);

create table if not exists likes (
  post_id uuid not null references posts on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  primary key (post_id, user_id)
);

create table if not exists tails (
  post_id uuid not null references posts on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  primary key (post_id, user_id)
);

-- ---------------------------------------------------------------- counters --

create or replace function bump_counts() returns trigger language plpgsql security definer as $$
declare delta int := case when tg_op = 'INSERT' then 1 else -1 end;
        row record := case when tg_op = 'INSERT' then new else old end;
begin
  if tg_table_name = 'likes'  then update posts set likes = greatest(0, likes + delta) where id = row.post_id; end if;
  if tg_table_name = 'tails'  then update posts set tails = greatest(0, tails + delta) where id = row.post_id; end if;
  if tg_table_name = 'follows' then
    update profiles set followers = greatest(0, followers + delta) where id = row.followee_id;
    update profiles set following = greatest(0, following + delta) where id = row.follower_id;
  end if;
  return null;
end $$;

drop trigger if exists likes_count on likes;
create trigger likes_count after insert or delete on likes for each row execute function bump_counts();
drop trigger if exists tails_count on tails;
create trigger tails_count after insert or delete on tails for each row execute function bump_counts();
drop trigger if exists follow_count on follows;
create trigger follow_count after insert or delete on follows for each row execute function bump_counts();

-- --------------------------------------------------------------------- RLS --

alter table profiles enable row level security;
alter table follows  enable row level security;
alter table posts    enable row level security;
alter table likes    enable row level security;
alter table tails    enable row level security;

-- Profiles are public. Privacy applies to what a profile *shows*, not to its
-- existence — you can always find someone to ask to follow them.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (true);
drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (auth.uid() = id);

drop policy if exists follows_read on follows;
create policy follows_read on follows for select using (true);
drop policy if exists follows_write on follows;
create policy follows_write on follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- A post is readable when its author is public, when you are the author, or
-- when you follow a private author. This is the rule the app's privacy toggle
-- is actually promising.
drop policy if exists posts_read on posts;
create policy posts_read on posts for select using (
  author_id = auth.uid()
  or exists (select 1 from profiles p where p.id = posts.author_id and not p.is_private)
  or exists (select 1 from follows f where f.followee_id = posts.author_id and f.follower_id = auth.uid())
);
drop policy if exists posts_write on posts;
create policy posts_write on posts for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists likes_rw on likes;
create policy likes_rw on likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists likes_read on likes;
create policy likes_read on likes for select using (true);
drop policy if exists tails_rw on tails;
create policy tails_rw on tails for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists tails_read on tails;
create policy tails_read on tails for select using (true);

-- ------------------------------------------------------------------- views --
-- The client reads these so "who liked what" never ships as a second query.

create or replace view feed_public as
  select p.*,
         coalesce((select array_agg(l.user_id) from likes l where l.post_id = p.id), '{}') as likes_by,
         coalesce((select array_agg(t.user_id) from tails t where t.post_id = p.id), '{}') as tails_by
  from posts p;

create or replace view feed_following as
  select f.* from feed_public f
  where f.author_id = auth.uid()
     or exists (select 1 from follows fo where fo.followee_id = f.author_id and fo.follower_id = auth.uid());


-- ---------------------------------------------------------------------------
-- Migration for a database created before profile pictures and banners.
-- Safe to run repeatedly.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists banner_url text;
alter table profiles drop constraint if exists profiles_avatar_url_check;
alter table profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or char_length(avatar_url) <= 200000);
alter table profiles drop constraint if exists profiles_banner_url_check;
alter table profiles add constraint profiles_banner_url_check
  check (banner_url is null or char_length(banner_url) <= 400000);

-- ---------------------------------------------------------------------------
-- Entitlements. Written only by the entitlements edge function, which runs with
-- the service role; the client may read its own row and nothing else. There is
-- deliberately no insert or update policy, so a signed-in user cannot grant
-- themselves a tier even with a valid JWT and a hand-rolled request.
-- ---------------------------------------------------------------------------
create table if not exists entitlements (
  user_id    uuid primary key references auth.users on delete cascade,
  tier       text not null default 'walkon'
             check (tier in ('walkon','starter','allpro','franchise')),
  expires_at timestamptz,
  source     text not null default 'none'
             check (source in ('none','trial','code','stripe')),
  ref        text,
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;
drop policy if exists entitlements_read_own on entitlements;
create policy entitlements_read_own on entitlements for select using (auth.uid() = user_id);

-- Promo codes never reach a client. The redeem route reads this with the
-- service role, which is the whole point of moving redemption off the device.
create table if not exists promo_codes (
  code      text primary key,
  tier      text not null check (tier in ('starter','allpro','franchise')),
  days      integer not null check (days > 0),
  max_uses  integer,
  uses      integer not null default 0,
  note      text,
  created_at timestamptz not null default now()
);
alter table promo_codes enable row level security;
-- No policies at all: the service role bypasses RLS, everyone else sees nothing.

-- ---------------------------------------------------------------------------
-- Moderation and safety.
-- ---------------------------------------------------------------------------
create table if not exists blocks (
  blocker_id uuid not null references profiles on delete cascade,
  blocked_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table blocks enable row level security;
drop policy if exists blocks_own on blocks;
create policy blocks_own on blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles on delete set null,
  post_id     uuid references posts on delete cascade,
  subject_id  uuid references profiles on delete cascade,
  reason      text not null,
  detail      text,
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz not null default now()
);
alter table reports enable row level security;
-- A reporter may file and may see what they filed. Nobody else reads the queue
-- through the API; moderators use the dashboard, which runs as service role.
drop policy if exists reports_insert on reports;
create policy reports_insert on reports for insert with check (auth.uid() = reporter_id);
drop policy if exists reports_read_own on reports;
create policy reports_read_own on reports for select using (auth.uid() = reporter_id);

-- Posts hidden by moderation stay in the table (an audit trail beats a delete)
-- but drop out of every read path.
alter table posts add column if not exists hidden_at timestamptz;
alter table posts add column if not exists hidden_reason text;

-- Blocked authors and hidden posts disappear from the feed for the reader, in
-- the database rather than in the client, so a patched client cannot un-hide
-- somebody who blocked them.
drop policy if exists posts_read on posts;
create policy posts_read on posts for select using (
  hidden_at is null
  and not exists (
    select 1 from blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = posts.author_id)
       or (b.blocker_id = posts.author_id and b.blocked_id = auth.uid())
  )
  and (
    author_id = auth.uid()
    or exists (select 1 from profiles p where p.id = posts.author_id and not p.is_private)
    or exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = posts.author_id)
  )
);

-- ---------------------------------------------------------------------------
-- Right to erasure. One call, everything the account owns, the login included.
-- Security definer so it can reach auth.users; it can only ever delete the
-- caller, because it never takes an id as an argument.
-- ---------------------------------------------------------------------------
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  -- Everything below cascades from profiles or auth.users, but reports are
  -- deliberately kept with a null reporter: a moderation record should survive
  -- the account that filed it, without naming them.
  update reports set reporter_id = null where reporter_id = me;
  delete from entitlements where user_id = me;
  delete from profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function delete_account() from public;
grant execute on function delete_account() to authenticated;
