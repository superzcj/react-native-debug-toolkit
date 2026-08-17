# Demo 验收

下面的命令都在 Toolkit 仓库根目录执行，不要先进入 `Demo/`。

## Debug 包自动上传

开两个终端：

```bash
npm run hub
```

```bash
npm run demo:ios
# 或：npm run demo:android
```

Demo 验证的是本机 Hub。浏览器打开 `hub dev` 打印的局域网地址，在 Demo 中进入 **Profile**，会产生一条 Navigation 日志。Hub 应显示 Demo App、设备 Session 和这条日志，不需要先点 Connect。

模拟器用 loopback / `10.0.2.2` / `adb reverse`；真机从 Metro bundle host 找到当前 Mac。Demo Debug 默认不配 `endpoint`，靠自动发现。

可以这样确认 Hub 已启动：

```bash
curl http://127.0.0.1:3800/ready
```

## 内测或 Release 包手动上传

构建一个显式启用 Toolkit、但不带 `__DEV__` 的 Demo。启动后不应上传日志。

1. 在 Connect 点 **Upload Once**。Hub 应收到当前快照，之后保持暂停。
2. 点 **Start Live Logs**，继续操作 App，Hub 应收到新日志。
3. 点 **Stop Live Logs**，再次操作 App，Hub 不应再有新日志。

宿主 App 还要在 iOS 的 ATS/Local Network 和 Android 的 cleartext 配置中允许访问这个内网 HTTP 地址。

## AI 验证

先启动 Hub，再跑 Demo，然后在仓库根目录执行一次：

```bash
npm run ai:init
```

直接对 AI 说「看刚才 Demo 的日志」，不必提供 appId 或 Session。多台设备同时在线时，AI 会让你选一台。

`init --check` 确认 Skill 是否最新；`init --update` 更新托管副本。Hub 只应出现在本机或局域网，不要暴露到公网。`tail --duration-ms` 限制时长；`--follow` 只取消时间上限，仍受 200 条 / 2 MiB 限制。

## 自动测试

```bash
npx jest node/hub/__tests__/cli.test.js node/hub/__tests__/hubServer.test.js src/__tests__/utils/HubClient.test.ts --runInBand
npm --prefix Demo test -- --runInBand
```

自动测试不能替代模拟器和真机的网络验收。
