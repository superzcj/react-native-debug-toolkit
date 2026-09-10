# 演示素材

[Demo 启动](../Demo/README.md) · [中文首页](../README.zh-CN.md)

| 素材 | 画面内容 | 参数 |
| --- | --- | --- |
| [App GIF](../demo.gif) | 请求响应 → 状态 → 自定义购物车 → Track 埋点 → 环境切换 → Clip 文本 → Logs → Connect | 468 × 1018，约 18 秒 |
| [Web GIF](media/hub.gif) | 同步日志总览 → 响应详情 → Staging 请求实时进入 → 埋点属性 → 状态 → 手机文本到达 | 1120 × 630，14 秒 |

素材来自真实 iOS Demo 和本地 Hub。App 将已有请求/状态片段与本次补录的功能片段拼接；Web 使用本次重新采集的画面。业务数据均为示例，请求走真实 HTTP 链路。

## 重新录制

1. 启动 Demo、Hub（3800）和业务 API（Development 3801、Staging 3802）。
2. 发起失败请求，在 Net、State、My Cart、Track 分别查看响应、状态、业务快照和埋点属性。
3. 在 Env 选择 Staging，回到首页发起成功请求。Hub 保持 Live，观察 3802 的 201 请求自动进入。
4. 在 Clip 输入一段示例文本并点 Copy；在 Mac Hub 的 Console 确认文本收到，随后展示 Logs 和 Connect 上传控制。
5. 每个重点保留约 1–2 秒，删除操作等待；不要遍历空面板。

App 原始录像和新增画面序列、Web 新画面序列均保存在本机 `Demo/recordings/`（Git 忽略）。用于重新编码的三个母片：

- `app-showcase-source.mov`：原始 App 请求/状态录像。
- `app-features-extension.mp4`：本次新增埋点、环境、文本和同步片段。
- `hub-expanded-source.mp4`：本次完整 Web 演示，画面按每秒 5 帧采集整理。

在仓库根目录运行 [render-gifs.sh](media/render-gifs.sh)：

```sh
bash docs/media/render-gifs.sh
```

文本演示验证的是手机 → Mac Hub；当前版本没有双向聊天入口。Android 本次未进行设备验收。
