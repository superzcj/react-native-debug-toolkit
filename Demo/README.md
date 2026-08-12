# Shared Hub v4 Demo 验收

Demo 在调试阶段默认接入调试 Mac 的固定局域网地址：`http://172.31.23.124:3800`。它的 `appId` 是 `com.reactnativedebugtoolkit.demo`。这样 iOS Simulator 和真机始终访问同一个 Hub。

## 1. 启动 Hub

在调试 Mac 上，从仓库根目录执行：

```sh
node bin/debug-toolkit.js hub start \
  --bind 172.31.23.124 \
  --port 3800 \
  --advertise-url http://172.31.23.124:3800 \
  --data-dir /tmp/react-native-debug-toolkit-hub
```

启动后，在本机验证：

```sh
curl http://172.31.23.124:3800/ready
```

返回 `ready: true` 且 `storage.writable: true` 才继续。当前仅用于本机前台验收；公共服务部署再改用固定 Mac mini 地址与 `hub install --system`。

## 2. 运行 Demo

```sh
cd Demo
npm run ios
# 或
npm run android
```

这个默认地址同时适用于 iOS Simulator 和真机。Android 模拟器也可以访问调试 Mac IP；若使用 Android Studio 的 host loopback 映射，才改为 `http://10.0.2.2:3800`。真机需按宿主 App 的 Debug 配置增加该内网地址的 ATS 例外。Release 保持关闭。

Demo 会排除一个与 Shared Hub 无关、且不兼容当前 React Native 新架构的旧 Clipboard 原生依赖；Toolkit 会自动使用其无原生模块的降级行为。

打开 Toolkit，进入 **Connect**：

1. 等待显示 `Connected` 和短码，例如 `#DEMO01-A1B2`。
2. 点击 **Sync**，确认最后同步时间更新。
3. 点击 **Pause**，制造一条日志，确认没有上传；再点击 **Resume** 和 **Sync**。

## 3. 从命令行和 AI 验证

在本机终端执行：

```sh
node bin/debug-toolkit.js status \
  --endpoint http://172.31.23.124:3800 \
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
