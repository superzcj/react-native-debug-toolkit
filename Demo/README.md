# Demo

用同一个 App 验证零业务配置和完整业务接入。[中文首页](../README.zh-CN.md) · [English](../README.md)

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

## 零配置模式

App 默认打开 **零配置**，根组件的接入只有一行：

```tsx
import { withDebugToolkit } from 'react-native-debug-toolkit';
export default withDebugToolkit(ZeroConfigApp);
```

[ZeroConfigApp.tsx](ZeroConfigApp.tsx) 不传 appId、Hub 地址、环境列表、账号、导航 ref 或状态 adapter。打开悬浮面板后，Network、Console、Native、State、Navigation、Track、Connect、Clipboard、History、Environment、Accounts、Custom 十二类页面都在。缺业务数据时为空；原生能力或服务不可用时显示实际状态。

- **生成标记日志**：写入一条 `integration-时间戳-序号` 日志。
- **发送测试请求**：写入新的标记，并把同一个标记放入 `/health` 的 query；页面显示实际 HTTP 状态或 API 离线状态。

API 地址来自 [demoApi.ts](demoApi.ts) 的业务约定，不通过 Toolkit 配置提供。

## 完整 Showcase 模式

点击顶部 **完整 Showcase**。两种模式的 HOC 都定义在模块作用域，切换时卸载前一个 App，运行中只挂载一个 Toolkit 宿主。完整配置集中在 [debug.config.tsx](debug.config.tsx)：

- Environment 的 `items/onChange` 同时更新真实 API 客户端和当前业务环境。
- Accounts 的 `source/onSwitch` 读取、切换示例商店的本地账号；请求会携带实际选择的 `accountId`。这是本地演示身份，不是远程登录服务。
- State adapter 订阅购物 store；Custom 中的购物车和访问路径读取同一业务源。
- App 使用自己的路由状态，以 `debug.navigation(...)` 记录真实页面跳转；Track 记录加购与结账事件。

按下面的流程操作：

1. 点 **Run failed checkout**，得到真实 HTTP 409。
2. 点 **Open inspector**，在 Net 打开请求，查看库存不足的响应 JSON。
3. 在 Track 核对埋点名称与属性；在 State 查看状态变化。
4. 在 Environment 切到 **Staging**，再点 **Try successful request**；请求实际发送到 **3802** 并返回 201。
5. 点 **Switch to studio account**，确认当前账号变化；下次结账的 body 包含 `accountId: "studio"`。
6. 点 **Copy checkout result**，查看 Phone、Console、Hub 各自的结果。Hub 只有确认收到文本后才显示 success；离线时显示 unavailable 或 error。Connect 可控制上传一次或持续同步。

Development 使用 3801，Staging 使用 3802；两者是独立监听的本地示例 API，响应头 `X-Demo-Environment` 标识环境。结账使用 text XHR，`sold-out` 场景在两种环境均返回 409，`available` 返回 201；切换环境本身不会把失败伪装成成功。两个结账按钮都会加购，State 和 Custom 随购物 store 更新；Profile → **Reset Demo Data** 重置购物状态，不删除 Hub 历史。

## 验证命令

```sh
npm --prefix Demo test -- --runInBand
npm --prefix Demo run test:api
npm --prefix Demo run typecheck
npm --prefix Demo run lint
```

Renderer 测试覆盖两种模式、十二页、409 → 环境切换 → 201、状态与账号同步、复制通道结果；API 测试启动真实 HTTP 服务检查状态码。这些不代替原生构建、设备运行和独立安装包的验证。

AI 接入与人工接入使用同一份公开文档和 API。可让 AI 阅读包的 README 与配置文档，把根组件改为 `withDebugToolkit(App)`，随后按现有业务源补充配置，无需安装接入 Skill。需要排查实际运行日志时，可使用项目已有的 Hub 查询能力。

[其他功能](../docs/usage.zh-CN.md) · [构建模式与排障](../docs/setup.zh-CN.md) · [录制说明](../docs/recording.md)
