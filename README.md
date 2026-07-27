# 基今 · AI 持仓分析

上传基金持仓截图，识别持仓并分析板块重叠、集中度与风险，支持自由提问。

## 开发

```bash
pnpm install
cp .env.example .env   # 填入阿里云 OCR / 通义 / Supabase 等配置
pnpm dev               # http://localhost:3000
```

数据库：见 `supabase/README.md`，在 Supabase SQL Editor 执行 `schema.sql`。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 本地开发 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 生产启动（`node .output/server/index.mjs`） |
| `pnpm generate-routes` | 重新生成路由树 |

## 技术栈

TanStack Start（React + Vite + Nitro）、Tailwind、shadcn/ui、Supabase（邀请码 + Magic Link）。

## 用 Docker 部署（推荐 · 阿里云 ECS）

### 1. 服务器准备

- ECS：Ubuntu 22.04+，安全组放行 **22 / 80 / 443**（调试可先放行 **3000**）
- 安装 Docker：

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录后再用 docker
```

### 2. 上传代码并写环境变量

```bash
# 把项目放到例如 /opt/jijin
cd /opt/jijin
cp .env.example .env
nano .env   # 填全所有密钥
```

`.env` 必填：`DASHSCOPE_*`、`ALIBABA_CLOUD_*`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_EMAILS`。

注意：`VITE_*` 在 **镜像构建时** 打进前端，改完后必须重新 `docker compose build`。

### 3. 构建并启动

```bash
cd /opt/jijin
docker compose up -d --build
docker compose logs -f   # 看启动日志
```

默认映射 **宿主机 3000 → 容器 3000**。改端口可在 `.env` 加：

```bash
HOST_PORT=8080
```

浏览器访问：`http://服务器公网IP:3000`。

### 4. 域名 + HTTPS（可选但建议）

1. 域名 A 记录指向 ECS 公网 IP  
2. 安装 Nginx，把 `deploy/nginx.conf` 拷到站点配置并 `nginx -t && systemctl reload nginx`  
3. 证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com
```

4. 若只想本机反代，把 `docker-compose.yml` 里 ports 改成 `127.0.0.1:3000:3000` 后重启。

### 5. 改 Supabase 回调（必做）

Authentication → URL Configuration：

- **Site URL**：`https://你的域名`（或 `http://IP:3000`）
- **Redirect URLs**：加上 `https://你的域名/auth/callback`

### 6. 常用命令

```bash
docker compose ps
docker compose logs -f --tail=100
docker compose restart
docker compose down
# 改了代码或 VITE_* 后：
docker compose up -d --build
```

### GitHub Actions 流水线

仓库已配置 `.github/workflows/docker.yml`：推送到 `main` 会构建镜像并推到 `ghcr.io/ben-artist/jijin`。

在 GitHub → **Settings → Secrets and variables → Actions** 添加：

| Secret | 用途 |
| --- | --- |
| `VITE_SUPABASE_URL` | 构建前端时注入（必填） |
| `VITE_SUPABASE_ANON_KEY` | 构建前端时注入（必填） |
| `DEPLOY_HOST` | ECS 公网 IP（可选，有则自动 SSH 部署） |
| `DEPLOY_USER` | SSH 用户，如 `root` |
| `DEPLOY_SSH_KEY` | 私钥全文 |
| `DEPLOY_PATH` | 服务器项目目录，如 `/opt/jijin` |

若要流水线自动 SSH 部署，再在 **Settings → Variables** 增加：`ENABLE_ECS_DEPLOY=true`。

服务器首次准备：

```bash
mkdir -p /opt/jijin && cd /opt/jijin
# 放 docker-compose.prod.yml 和填好的 .env
# 若 GHCR 包是私有：先 docker login ghcr.io
docker compose -f docker-compose.prod.yml up -d
```

### 不写 compose 的等价命令

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t jijin .

docker run -d --name jijin --restart unless-stopped \
  -p 3000:3000 --env-file .env jijin
```
