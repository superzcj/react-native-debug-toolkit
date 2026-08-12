# Shared Hub v4 Demo 验收

Demo 的 Debug 配置固定使用调试 Mac 的局域网地址 `http://172.31.23.124:3800`，`appId` 为 `com.reactnativedebugtoolkit.demo`。模拟器和真机都使用这个地址；真机不能使用 `127.0.0.1`。

## 1. 启动本地 Hub

在仓库根目录执行：

```sh
node bin/debug-toolkit.js hub start \
  --bind 172.31.23.124 \
  --port 3800 \
  --advertise-url http://172.31.23.124:3800 \
  --data-dir /tmp/react-native-debug-toolkit-hub
```

确认服务已就绪：

```sh
curl http://172.31.23.124:3800/ready
```

本地验收使用前台服务；公共服务部署使用固定 Mac mini 地址和 `hub install --system`。

## 2. 运行 Demo 并验证 Debug 自动上传

```sh
cd Demo
npm run ios
# 或 npm run android
```

1. 打开 Demo，点击 **Profile**，产生一条 Navigation 日志。
2. 浏览器打开 `http://172.31.23.124:3800/console`。
3. 选择 `com.reactnativedebugtoolkit.demo` 和刚出现的设备，确认能看到日志。
4. 在 Toolkit 的 **Connect** Tab 点击 **Stop Live Logs**，再操作一次 App；Hub 不应出现新日志。点击 **Start Live Logs** 后再次操作，日志应继续出现。

**Upload Once** 用于把当前 feature snapshot 上传一批，不需要短码或额外确认。

## 3. 验证内测/Release 手动上传

为内部 Release 构建显式设置 `enabled={true}`，并保留 Demo 的 `devConnect` 配置。启动后先不要操作 Connect：Hub 不应收到日志。

1. 进入 **Connect**，点击 **Upload Once**，Hub 应新增当前 snapshot 的一批日志，随后状态为暂停。
2. 点击 **Start Live Logs**，继续操作 App，Hub 应持续收到新日志。
3. 点击 **Stop Live Logs**，后续操作不应继续上传。

真机需要在宿主 App 的 debug/internal 配置中允许访问该内网 HTTP 地址（iOS ATS/Local Network、Android cleartext）。

## 4. 从 CLI 与 AI 验证

```sh
node bin/debug-toolkit.js status \
  --endpoint http://172.31.23.124:3800 \
  --app-id com.reactnativedebugtoolkit.demo
```

在 Demo 根目录生成仓库 Skill：

```sh
node ../bin/debug-toolkit.js init-skill
```

之后直接让 AI “看刚才的日志”。一个活跃 Session 会自动读取；存在多台设备时，AI 会展示设备信息供选择一次。

## 5. 自动回归

```sh
cd Demo
npm test -- --runInBand
```

测试覆盖 Connect 的三个控件、Debug 自动上传，以及上传事件的 SHA-256 `payloadHash`。它不替代真机网络验收；真机需完成第 1～4 步。
