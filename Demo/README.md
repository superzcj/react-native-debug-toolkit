# Demo

用一次结账展示 **App 请求检查 → Hub 实时日志 → AI 查询**。[中文首页](../README.zh-CN.md) · [English](../README.md)

## 启动

需要 Node ≥22.11、React Native 原生构建环境。从仓库根目录安装：

```sh
npm install
npm --prefix Demo install
cd Demo/ios && pod install
cd ../..
```

以下命令各在一个终端运行：

```sh
npm run hub                # 日志 Hub：3800
npm run demo:api           # 示例 API：3801 / 3802
npm --prefix Demo start    # Metro：8081
```

另开终端运行 App：

```sh
npm run demo:ios
# 或 npm run demo:android
```

浏览器打开 [localhost:3800](http://127.0.0.1:3800/)。真机请把 [demoApi.ts](demoApi.ts) 的 `DEMO_HOST` 改为电脑局域网 IP，并确保 3800/3801/3802 可达。

## 体验核心流程

1. 点 **Run failed checkout**，得到真实 HTTP 409。
2. 点 **Open inspector**，在 Net 打开请求，查看库存不足的响应 JSON。
3. 在 Track 核对埋点名称与属性；在 State 查看状态变化。
4. 在 Env 切到 **Staging**，再点 **Try successful request**；Hub 中会出现端口为 **3802** 的 201 请求。
5. 在 Clip 输入文本并点 Copy，在 Mac Hub 的 Console 查看同一条文本；Connect 可控制上传一次或持续同步。

Development 使用 3801，Staging 使用 3802；两者是独立监听的本地示例 API，响应头 `X-Demo-Environment` 标识环境。业务数据为示例，结账使用 text XHR。State 由 React state + `addZustandLog` 记录。两个按钮都会加购；Profile → **Reset Demo Data** 重置演示，不删除 Hub 历史。

## AI 查询

```sh
npm run ai:init                             # 首次安装仓库 Skill
node bin/debug-toolkit.js diagnose --json    # 检查运行证据
```

AI 工具加载 Skill 后，直接说：“看刚才结账为什么失败。”

[其他功能](../docs/usage.zh-CN.md) · [构建模式与排障](../docs/setup.zh-CN.md) · [录制说明](../docs/recording.md)
