# Shared Hub v4 Demo 验收

Demo 已固定接入 Shared Hub v4。它的 `appId` 是 `com.reactnativedebugtoolkit.demo`；只需把 [App.tsx](./App.tsx) 的 `DEMO_HUB.endpoint` 改为公共 Mac mini 的实际地址。

## 1. 启动 Hub

在公共 Mac mini（或同一局域网中用于验收的 Mac）从仓库根目录执行：

```sh
node bin/debug-toolkit.js hub start \
  --bind 10.20.4.10 \
  --advertise-url http://10.20.4.10:3799 \
  --data-dir /Users/Shared/ReactNativeDebugToolkit/log-hub
```

把示例 IP 换成 Mac mini 的固定 IP。启动后，任意同网设备可验证：

```sh
curl http://10.20.4.10:3799/ready
```

返回 `ready: true` 且 `storage.writable: true` 才继续。长期公共服务使用 `hub install --system`；本说明先使用前台启动，便于 Demo 验收和排错。

## 2. 运行 Demo

```sh
cd Demo
npm run ios
# 或
npm run android
```

Android Debug 构建已允许连接到 HTTP Hub，Release 保持关闭。iOS 使用真机 HTTP 地址时，按宿主 App 的 Debug 配置增加该内网地址的 ATS 例外；不要把这项例外带进生产构建。

Demo 会排除一个与 Shared Hub 无关、且不兼容当前 React Native 新架构的旧 Clipboard 原生依赖；Toolkit 会自动使用其无原生模块的降级行为。

打开 Toolkit，进入 **Connect**：

1. 等待显示 `Connected` 和短码，例如 `#DEMO01-A1B2`。
2. 点击 **Sync**，确认最后同步时间更新。
3. 点击 **Pause**，制造一条日志，确认没有上传；再点击 **Resume** 和 **Sync**。

## 3. 从命令行和 AI 验证

在能访问该局域网/VPN 的终端执行：

```sh
node bin/debug-toolkit.js status \
  --endpoint http://10.20.4.10:3799 \
  --app-id com.reactnativedebugtoolkit.demo
```

看到刚才的短码后，在 Demo 根目录生成仓库内的 AI Skill：

```sh
cd Demo
node ../bin/debug-toolkit.js init-skill
```

它会从 Demo 的 `DebugView` 配置读取固定的 `appId` 与 `endpoint`。然后告诉 AI 短码。AI 先记录该 Session 的 `lastManualSyncAt`，再请你点击 **Sync**，只在该值确实变新时读取日志，避免误读其他同事的 Session。

## 4. 自动回归

```sh
cd Demo
npm test -- --runInBand
```

这会验证 v4 的 Connect 控件、Session 短码、暂停/恢复，以及 **Sync** 发出的 SHA-256 `payloadHash`。它不替代真机网络验收；真机验收还必须完成第 1～3 步。
