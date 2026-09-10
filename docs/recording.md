# 演示素材

[Demo 启动](../Demo/README.md) · [中文首页](../README.zh-CN.md)

| 素材 | 核心画面 | 参数 |
| --- | --- | --- |
| [App GIF](../demo.gif) | 触发 409 → 打开请求 → 查看响应 | 468 × 1018，约 7 秒 |
| [Hub GIF](media/hub.gif) | 失败响应 → 201 实时进入 → 成功响应 | 1120 × 630，8 秒 |

画面来自实际 iOS Demo 和本地 Hub，使用示例业务数据及真实 HTTP 请求。短版只保留核心流程，不展示状态、自定义 Tab 等完整功能巡览。

## 重新录制

1. 启动 Demo、业务 API 和 Hub；重置 Demo 数据，选择当前 Hub 会话。
2. Simulator **File → Record Screen**：录下 **Run failed checkout → Open inspector → Net 响应**。
3. 浏览器保持 Live：录下失败响应、App 发起成功请求后新记录进入、成功响应。
4. 每段控制在 7–8 秒，过渡快速切换，响应保留约 2 秒阅读时间。

本次母片位于本机 `Demo/recordings/`（已被 Git 忽略）。剪辑区间与编码命令见 [render-gifs.sh](media/render-gifs.sh)，在仓库根目录运行：

```sh
bash docs/media/render-gifs.sh
```

仅录制示例数据。CLI 已验证 `evidence_ready`，未录制 AI 自动修复；Android 本次未验收。
