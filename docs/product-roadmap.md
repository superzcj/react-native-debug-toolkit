# React Native Debug Toolkit 路线图

更新：2026-05-13

## 定位

旧：App 内浮动调试面板。

新：React Native 本地调试桥。

```text
App logs -> Debug Panel -> local daemon -> Web / HTTP / MCP
```

意义：

- 真机日志回到 Mac。
- Web Console 给人看。
- HTTP API 给 curl / 脚本 / AI 读。
- MCP 可选，不是主链路。

## 已有

App：

- Network / Console / Navigation / Track / Zustand
- Environment / Clipboard
- XHR 捕获 fetch 和 axios 默认 adapter
- Desktop Logs：`Send Once` / `Start Live Sync`
- `/health` 预检
- 真机 Mac IP 输入
- daemon 请求 blacklist，避免自污染

Desktop：

- 单 bin：`debug-toolkit`
- daemon：HTTP API + 本地 device log store
- Web Console：列表、详情、筛选、failed only、复制 JSON、curl 命令、SSE
- 默认 `0.0.0.0:3799`
- 启动打印 `LAN IPs`
- MCP：`list_app_devices`、`get_app_logs`

边界：

- 不接 AI API
- 不做云服务
- 不默认脱敏
- Network 只监测，不分析 auth/token
- CLI daemon 默认持久化设备日志

## 原则

1. 本地优先。
2. HTTP 优先。
3. MCP 可选。
4. App 内面板保留。
5. 先保证真机能通、日志能读、失败能诊断。
6. 不追 React Native DevTools。

## 缺口

- Web Console 缺浏览器 e2e。
- CLI 缺查询命令。
- 真机失败诊断仍靠人工。
- 多设备命名仍偏技术化。
- 日志仍分散在多个 tab。
- AI 缺精简上下文包。
- Network 缺 replay / mock / delay。
- Zustand 缺 diff / restore。

## 优先级

### P0：稳定本地调试桥

- Web Console e2e
- Doctor 页
- Copy cURL
- `debug-toolkit devices`
- `debug-toolkit logs`
- 多设备命名

### P1：让日志好读

- Device Log Timeline
- AI Bundle
- error-first 裁剪
- 全局过滤
- Marker
- ignore 规则
- 可选 redaction 规则

### P2：复现问题

- Network Replay
- Edit Replay
- Mock / Delay Profile
- Zustand Diff
- Zustand Snapshot Restore

### P3：团队工作台

- Issue Mode
- Report Export
- Tools Hub
- 轻量性能视图
- 远程上传 hook

## Issue 草案

| # | Issue | 目标 |
| --- | --- | --- |
| 1 | `test: add browser e2e coverage for web console` | 覆盖 report、ingest、SSE、筛选、复制 |
| 2 | `feat: add daemon doctor page for real device setup` | 降低真机联通排查成本 |
| 3 | `test: add web console curl-command coverage` | 防止 curl 入口回退 |
| 4 | `feat: add device log store rotation policy controls` | 可配置保留数量和文件位置 |
| 5 | `feat: add debug-toolkit devices and logs commands` | 避免手写 HTTP URL |
| 6 | `feat: add unified device log timeline` | 按时间串起多类日志 |
| 7 | `feat: generate compact AI debug bundle` | 给 AI 一份小而准的上下文 |
| 8 | `feat: identify and label multiple reporting devices` | 多真机不混淆 |
| 9 | `feat: replay captured network requests` | 从观察走向复现 |
| 10 | `feat: add clear_app_logs MCP tool` | 让 MCP 能清理 daemon 设备日志 |

## 不做

- 云账号
- 自研 JS 断点调试器
- 官方 DevTools 替代品
- 重桌面客户端
- 默认脱敏
- token/auth 专项分析

## Release Gate

```bash
npm run typecheck
npm test -- --runInBand --watchman=false
npm run lint
npm pack --dry-run
node bin/debug-toolkit.js --daemon-only
curl http://127.0.0.1:3799/health
```
