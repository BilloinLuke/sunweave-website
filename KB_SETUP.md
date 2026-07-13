# 云端知识库（CSV 数据源 RAG）接通指南

站点内置"云端知识库"：你只要在**任意一个可公开访问的 CSV 链接**里持续添加问答，
机器人的回答就会自动用上这些内容，**不用改任何代码**。

支持的数据源（任选其一，本质都是"一个公开 CSV 链接"）：
- **Gitee 仓库（国内免费，推荐）**：把 `kb.csv` 提交到公开仓库，用 raw 链接。
  国内服务器访问稳定、零 API 密钥、不用翻墙。
- **Google 表格（原方案）**：发布为 CSV 链接（国内服务器抓取可能不稳定）。
- 其他能给出公开 CSV/文本链接的服务同理。

列格式（中英文都认）：`Topic, Keywords, Answer`（或 `主题, 关键词, 回答`）。
模板 `kb.csv`（与 `kb-template.csv` 内容相同）已预填 16 条沙滩巾外贸知识，可直接用。

---

## 方案 A：Gitee（国内免费，推荐）

1. 注册/登录 [Gitee](https://gitee.com)，新建一个**公开**仓库。
2. 把本项目里的 `kb.csv` 上传/提交到仓库根目录
   （也可在 Gitee 网页直接「新建文件」粘贴内容）。
3. 拿到 raw 链接：在仓库里点开 `kb.csv` → 右上角 **Raw** → 复制地址栏链接，形如
   `https://gitee.com/你的用户名/你的仓库/raw/master/kb.csv`
   （分支是 `master` 还是 `main` 以你的仓库实际分支为准）
4. 公开仓库本身即可被服务器抓取，**无需额外权限设置**（这一点比 Google 表格省心）。
5. 把链接填进 `.env` 的 `KB_CSV_URL`（见第三节）。

> 之后改知识：在仓库里**编辑 `kb.csv` 并提交**，最多等 `KB_TTL`（默认 5 分钟）机器人就用上新内容。

---

## 方案 B：Google 表格（原方案）

1. 打开 [Google 表格](https://sheets.google.com) → 导入 `kb-template.csv`。
2. `文件` → `共享` → `发布到网页` → 选 `整个文档` + `逗号分隔值 (.csv)` → 复制链接
   （形如 `.../pub?gid=0&single=true&output=csv`）。
3. 共享权限设为"知道链接的人可查看"，否则服务器抓不到。
4. 把链接填进 `.env` 的 `KB_CSV_URL`。

---

## 三、填进 .env 并重启

编辑项目根目录的 `.env`：

```env
KB_ENABLED=true
KB_CSV_URL=你的CSV链接        # Gitee raw 或 Google 表格发布链接
KB_TOP_K=3                     # 每次最多注入几条命中知识
KB_TTL=300                     # 服务器缓存秒数（改表后最多等这么久才生效）
```

- 本地：保存后**重启 `node server.js`**（`KB_TTL` 内改表不会立刻生效，等几分钟或重启）。
- 生产（Vercel 等）：在平台环境变量里同样设置，然后重新部署。

---

## 四、之后怎么加知识

- **Gitee**：在仓库里编辑 `kb.csv` 并提交，最多等 `KB_TTL`（默认 5 分钟）即生效。
- **Google 表格**：表格里新增一行即可。

全程**不用碰代码、不用重新部署**。

---

## 五、让命中更准的 3 个要点

1. **Keywords 多写同义词**：客户可能说 moq / minimum order / how many pcs，
   都写进 `Keywords` 列，命中率才高。
2. **短词不计入匹配**：单词长度 < 3 的 token（如 "me"）不参与打分，避免误命中；
   同时单条得分 < 3 不会注入，因此一两行内容不会被乱塞进提示词。
3. **Answer 用客户语言写**：机器人面向海外买家，回答建议用英文；中文也可，按你的客群定。

---

## 六、本地自测（可选）

不想等云端，可先本地验证检索是否 OK：

```bash
# 终端 A：把项目目录起个静态服务
python3 -m http.server 8124

# 终端 B：跑检索测试
node -e "const kb=require('./api/kb.js');kb('what is your MOQ?',{url:'http://localhost:8124/kb.csv',ttl:5,topK:3}).then(r=>console.log(r))"
```

能看到对应答案即接通成功。

> 注：`.env` 含真实 `GEMINI_API_KEY` 与 `DEEPSEEK_API_KEY`，切勿提交到公开仓库。
