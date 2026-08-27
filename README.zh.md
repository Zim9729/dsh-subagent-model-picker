# dsh-subagent-model-picker

DeepSeek Harness Desktop 的会话级子 agent 模型选择插件。

[English Documentation](./README.md)

## 功能

- 在对话输入区添加"子 agent 模型"选择器。
- 列出 `llm-pi-ai` 设置中所有已配置的 provider/model 组合。
- 默认选项"跟随主 agent"实时镜像主 agent 当前使用的模型。
- 将所选 provider/model 应用于 `subagent`、`subagent_fork` 及 workflow 子 agent。
- 当子会话被寻址时，覆盖值保留在根会话上。
- 重启后从 DSH home 存储目录恢复覆盖值。
- 提供 `subagent_model_ctl` 模型工具，支持 `get`、`set`、`clear` 操作。
- 使用同源 loopback API，包含会话、模型、方法和请求大小校验。

## 安装

### 命令行

```text
dsh plugin --profile desktop add @zim9729/dsh-subagent-model-picker@0.2.0
```

### DSH Web

打开 DSH Web GUI（如 `http://127.0.0.1:43120`），进入 **设置 → 插件**，搜索 `dsh-subagent-model-picker`，点击 **安装**。Web 插件管理器会自动从 npm 解析包并添加到当前 profile。

安装后（无论哪种方式），按提示重启 DSH。包已声明 `dsh.bundle.patch` 和 `dsh.client`，Host 和浏览器入口自动挂载。不要手动向 profile 的 `cordis.patch.yml` 添加重复行。

## 工作原理

| 选择 | 子 agent 模型 |
|---|---|
| 跟随主 agent（默认） | 镜像主 agent 当前使用的 provider/model |
| 指定 provider/model | 当前会话所有子 agent 使用所选组合 |

主 agent 的模型始终由 GUI 主模型选择器控制，不受此插件影响。

## 存储

覆盖值存储在：

```text
<DSH_HOME>/storages/subagent-model-overrides.json
```

文件为版本化 JSON 对象，以根会话 ID 为键。无效或过期记录会被忽略，对应会话销毁时自动清理。

## 兼容性

目标 DSH `0.1.1-rc.2` 服务契约，Node.js 20+。包使用 DSH peer dependencies，不捆绑 Host 运行时。

## 开发

```text
npm install
npm run check
npm pack
```

`npm run check` 构建可分发的 JavaScript 文件、运行全部测试、执行 npm dry-run 打包检查。

## 发布

1. 将仓库推送到 GitHub。
2. 从干净的 tag commit 执行 `npm publish --access public`。
3. 向 DSH 插件中心提交 npm 包/仓库地址。

插件中心目录与 npm 发布是两个独立操作。

## 安全

本地 API 仅接受 loopback 同源浏览器请求。模型凭据永远不会被此插件读取或返回。
