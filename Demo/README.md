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

Demo 验证的是本机 Hub。它当前使用 `http://172.31.23.124:3800`。浏览器打开这个地址，在 Demo 中进入 **Profile**，会产生一条 Navigation 日志。Hub 应显示 Demo App、设备 Session 和这条日志，不需要先点 Connect。

模拟器和真机都用调试 Mac 的局域网 IP。真机不能用 `127.0.0.1`。如果调试 Mac 换了地址，先改 `Demo/App.tsx` 中的 Hub 地址。

可以这样确认 Hub 已启动：

```bash
curl http://172.31.23.124:3800/ready
```

## 内测或 Release 包手动上传

构建一个显式启用 Toolkit、但不带 `__DEV__` 的 Demo。启动后不应上传日志。

1. 在 Connect 点 **Upload Once**。Hub 应收到当前快照，之后保持暂停。
2. 点 **Start Live Logs**，继续操作 App，Hub 应收到新日志。
3. 点 **Stop Live Logs**，再次操作 App，Hub 不应再有新日志。

宿主 App 还要在 iOS 的 ATS/Local Network 和 Android 的 cleartext 配置中允许访问这个内网 HTTP 地址。

## AI 验证

在仓库根目录执行一次：

```bash
npm run ai:init
```

然后直接对 AI 说："看刚才 Demo 的日志"。只有一个活跃 Demo Session 时，AI 会直接读取；有多台设备时，它会让你选一台。

## 自动测试

```bash
npx jest node/hub/__tests__/cli.test.js node/hub/__tests__/hubServer.test.js src/__tests__/utils/HubClient.test.ts --runInBand
npm --prefix Demo test -- --runInBand
```

自动测试不能替代模拟器和真机的网络验收。
