# Supabase 接入说明（内测）

## 1. 执行建表 SQL

打开 [SQL Editor](https://supabase.com/dashboard/project/ozedylljudccdzkbxruz/sql)，粘贴并运行仓库内：

`supabase/schema.sql`

会创建：邀请码、用户配额、基金、重仓、股票简介，并种子邀请码 `JIJIN-BETA`（50 人 × 每人 10 次）。

## 2. 开启邮箱 Magic Link

Authentication → Providers → Email：

- 开启 Email
- 建议开启 Magic Link / OTP（按控制台文案）

Authentication → URL Configuration：

- Site URL：`http://localhost:3000`
- Redirect URLs 增加：
  - `http://localhost:3000/auth/callback`
  - 上线后再加生产域名

## 3. 环境变量

见 `.env.example`。注意：

- `VITE_SUPABASE_ANON_KEY` = Publishable key（`sb_publishable_…`）
- `SUPABASE_SERVICE_ROLE_KEY` = Secret key（`sb_secret_…`，**不要**加 `VITE_` 前缀）

## 5. 一人一码管理页

1. `.env` 设置 `ADMIN_EMAILS=你的登录邮箱`
2. 用该邮箱 + 任意有效邀请码登录后，顶栏出现「邀请码」
3. 打开 `/admin/invites` 批量生成、复制、停用
