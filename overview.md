# 修复买家聊天日志写入 Gitee 失败

## 完成内容
修复了买家聊天消息无法按 IP 追加到 Gitee CSV 的问题。用户在本地测试时聊天功能正常，但 `server.log` 持续报错：

```
[chatlog] retry failed: PUT 400 {"message":"文件名已存在"}
```

## 真正根因
调试日志显示读取 `chat-logs/<ip>.csv` 返回 **200**，并且已经正确拿到 `content` 和 `sha`，所以问题不是读取失败。

真正原因是：**Gitee Contents API 对新建文件用 `POST`，对更新文件用 `PUT`**。原代码无论新建还是更新都使用 `POST`，导致带 SHA 的更新请求被 Gitee 当成"新建文件"处理，于是返回 `400 文件名已存在`。

## 核心改动

**文件：`api/chatlog.js`**

1. **修复 `giteePut()` HTTP 方法**：
   - 无 `sha` 时仍用 `POST`（新建文件）
   - 有 `sha` 时改用 `PUT`（更新文件）
   - 错误信息也改为真实方法名，方便调试

2. **保留的多层读取兜底**（上一轮已加入）：
   - `giteeGetFile()`：直接读取文件内容 API
   - `giteeGetDirFile()`：目录列表兜底，用于获取已有文件 SHA
   - `giteeGetRaw()`：通过 raw 链接下载文件内容兜底
   - `loadEntry()`：统一把 Gitee 响应转成 `{ sha, content }`
   - 所有读取/写入/raw 操作都输出 `[chatlog]` 调试日志

## 用户后续操作

1. 在项目目录执行一键重启：
   ```bash
   cd /Users/Luke/WorkBuddy/2026-07-11-22-16-10
   ./restart.sh
   ```

2. 打开聊天页面并发送消息：
   - `http://localhost:8123/index.html`
   - `http://localhost:8123/products.html`

3. 观察 `server.log`：
   ```bash
   tail -f /Users/Luke/WorkBuddy/2026-07-11-22-16-10/server.log
   ```

4. 期望看到 `[chatlog] chat log ::1 ok`（或你的真实 IP），然后 Gitee 仓库 `shouji-kb/chat-logs/` 下的 CSV 会追加新行。

## 注意事项

- 如果仍失败，请把 `server.log` 里所有 `[chatlog]` 开头的行复制给我，新的调试日志会显示具体哪一步失败。
- 聊天记录含买家隐私，请确保 `shouji-kb` 仓库保持私有。
