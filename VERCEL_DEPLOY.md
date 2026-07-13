# 部署到 Vercel（AI 对话 + 知识库完整上线）

本站点 = 静态页面（`index.html` / `factory.html` / `products.html` / `product.html` + `assets/`）
**+ 一个云端函数** `api/chat.js`（自动变成 `POST /api/chat`）。

函数负责：调 DeepSeek 回答 + 抓取 Gitee 知识库（`kb.csv`）注入。
API key 全在服务端，浏览器永远看不到。零依赖，无需 build。

---

## 方式一：Vercel 网页导入（最简单，推荐）

1. 把整个项目文件夹推到 GitHub / GitLab（`.env` 已被 `.gitignore` 忽略，不会进仓库）。
2. 打开 [vercel.com](https://vercel.com) → **Add New → Project** → 导入该仓库。
3. 框架预设会显示 **Other**（因为 `vercel.json` 已声明 `framework: null`），无需改。
4. 展开 **Environment Variables**，把下面「必填环境变量」9 个**逐个粘贴**。
5. 点 **Deploy** → 几十秒后拿到 `https://你的项目.vercel.app`。

## 方式二：你 Mac 本地 CLI（无需推 Git）

```bash
cd /Users/Luke/WorkBuddy/2026-07-11-22-16-10
npx vercel          # 首次会打开浏览器登录一次，之后自动识别 api/chat.js
# 按提示回车即可；上线生产环境：
npx vercel --prod
```

---

## 必填环境变量（9 个，在 Vercel 后台 Environment Variables 粘贴）

| 变量 | 值 | 说明 |
|------|----|------|
| `CHAT_PROVIDER` | `deepseek` | 用 DeepSeek 回答 |
| `DEEPSEEK_API_KEY` | `sk-930cfc1980014c708d1184052bf24529` | 你的 DeepSeek key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名 |
| `CHAT_PROXY_URL` | **（留空）** | Vercel 云端直连外网，**不用代理**。仅本地 Mac 才填 Clash 端口 |
| `KB_ENABLED` | `true` | 开启知识库 |
| `KB_CSV_URL` | `https://gitee.com/luke888888/sunweave-kb/raw/master/kb.csv` | Gitee 知识库 raw 链接 |
| `KB_TOP_K` | `3` | 每次取最相关 3 条 |
| `KB_TTL` | `300` | 知识库缓存 5 分钟 |
| `ALLOWED_ORIGIN` | `*` | 先放行所有；上线后改成你的域名，如 `https://www.sunweave.com` |

> ⚠️ **`CHAT_PROXY_URL` 在 Vercel 上必须留空。** 这个变量只在你本地 Mac 跑 `node server.js` 且需要走 Clash 代理时才填。云端服务器直连 DeepSeek / Gitee，填了反而可能连不通。

---

## 买家聊天记录（按 IP 存到 Gitee，额外 6 个环境变量）

每个买家按 **IP** 存一个 CSV 表格：`<GITEE_LOG_REPO>/<GITEE_LOG_PATH>/<ip>.csv`。
同一 IP 多次访问**追加到同一个文件**，所以一个 IP = 一张完整对话表。
列：`timestamp,ip,role,message`（role = user / assistant）。

| 变量 | 值 | 说明 |
|------|----|------|
| `CHAT_LOG_ENABLED` | `true` | 开启聊天记录保存 |
| `GITEE_TOKEN` | `你的 Gitee 私人令牌` | 在 Gitee **设置 → 私人令牌** 生成，勾选 `projects`(repo) 读写权限 |
| `GITEE_LOG_REPO` | `luke888888/shouji-kb` | 存日志的仓库 `owner/repo`（**不带 `.git` 后缀**） |
| `GITEE_LOG_BRANCH` | `master` | 分支 |
| `GITEE_LOG_PATH` | `chat-logs` | 仓库内的文件夹，每个 IP 一个 CSV |
| `CHAT_LOG_TIMEOUT` | `5000` | 单次写入超时(ms)，超时放弃但不影响聊天 |

> 🔒 **隐私提醒**：聊天记录可能含买家个人信息（姓名、邮箱、询盘内容）。**日志仓库务必设为私有**，或把 `GITEE_LOG_REPO` 指向一个专门的私有仓库。不要往公开仓库写日志。
> Gitee API 有频率限制，高并发站点日志可能偶发写入失败——代码已做"尽力而为 + 超时放弃"，不会因此拖慢或中断聊天。

---

## 验证是否成功

部署完成后打开站点，点开 AI 对话框问一句：

> **What is your MOQ?**

- 如果它按 `kb.csv` 里写的起订量回答（如 500 pcs）→ 成功，AI + 知识库都通了。
- 如果报错：去 Vercel 后台 **Functions → /api/chat → Logs** 看错误，通常是某个环境变量漏填或填错。

---

## 注意事项

- `.env` 已 gitignore，不会进仓库；Vercel 只认上面 9 个环境变量，不会读你本地的 `.env`。
- `netlify/functions/chat.js` 是**过时旧版**（只连 Gemini、没知识库、端点也不对），请勿用于发布，可删除。
- DeepSeek 是纯文本模型：对话里传图按钮 UI 仍在、文件也能选，但模型只看文字；买家发图时助手会提示用文字描述。要看图请改回 `CHAT_PROVIDER=gemini`。
- 想换域名：Vercel 后台 **Domains** 添加你的域名，再把 `ALLOWED_ORIGIN` 改成它。
