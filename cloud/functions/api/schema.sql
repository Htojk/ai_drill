-- ai_drill 后端表结构（CloudBase PostgreSQL 模式）
-- 执行方式：node tools/backend-admin.mjs migrate
--
-- 设计要点：
-- 1. 账号与进度分表：账号表只放凭据，进度表一行一个用户（payload 是 jsonb 聚合包），
--    这样前端一次会话只需要一读一写，显著降低请求次数。
-- 2. 这两张表刻意「不」授权给 anon / authenticated：只有云函数（service_role）
--    能访问。客户端拿不到数据库凭据，也就不存在绕过隔离的可能。

create table if not exists public.drill_accounts (
  uid           uuid primary key,
  username      text not null,
  username_key  text not null unique,
  pwd_salt      text not null,
  pwd_hash      text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.drill_progress (
  uid        uuid primary key references public.drill_accounts (uid) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  revision   bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists drill_progress_updated_idx on public.drill_progress (updated_at desc);

revoke all on public.drill_accounts from anon, authenticated;
revoke all on public.drill_progress from anon, authenticated;
