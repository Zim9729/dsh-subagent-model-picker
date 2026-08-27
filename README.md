# dsh-subagent-model-picker

Per-conversation subagent model selection for DeepSeek Harness Desktop.

[中文文档](./README.zh.md)

## Features

- Adds a "Subagent Model" selector beside the conversation composer.
- Lists all configured provider/model pairs from the `llm-pi-ai` settings.
- The default option ("Follow main agent") mirrors the main agent's current model in real time.
- Applies the selected provider/model to `subagent`, `subagent_fork`, and workflow child agents.
- Keeps the override at the root conversation when a child session is addressed.
- Restores the override after restart from the DSH home storage directory.
- Provides the `subagent_model_ctl` model tool with `get`, `set`, and `clear` actions.
- Uses a same-origin loopback API with session, model, method, and request-size validation.

## Install

Install through the DSH profile/plugin manager:

```text
dsh plugin --profile desktop add @zim9729/dsh-subagent-model-picker@0.2.0
```

The package declares both `dsh.bundle.patch` and `dsh.client`, so the Host entry and browser entry are mounted by the normal DSH bundle pipeline. Restart DSH after installation when the installer reports that a restart is required.

Do not add a second manual row for this package to the profile's `cordis.patch.yml`; the package's own bundle patch already mounts its row.

## How It Works

| Selection | Subagent model |
|---|---|
| Follow main agent (default) | Mirrors the main agent's current provider/model |
| A specific provider/model pair | Uses the selected pair for all child agents in this conversation |

The main agent's model is always controlled by the GUI model selector and is not affected by this plugin.

## Storage

Overrides are stored in:

```text
<DSH_HOME>/storages/subagent-model-overrides.json
```

The file contains a versioned JSON object keyed by root conversation session ID. Invalid or stale records are ignored and removed when the corresponding session is disposed.

## Compatibility

Targets DSH `0.1.1-rc.2` service contracts and Node.js 20 or newer. The package uses DSH peer dependencies rather than bundling the Host runtime.

## Development

```text
npm install
npm run check
npm pack
```

`npm run check` builds the distributable JavaScript files, runs all tests, and performs an npm dry-run package check.

## Publishing

1. Push this repository to GitHub.
2. Run `npm publish --access public` from a clean tagged commit.
3. Submit the npm package/repository URL to the DSH plugin center registry.

The plugin center catalog and npm publication are separate operations.

## Security

The local API accepts only loopback same-origin browser requests. Model credentials are never read or returned by this plugin.
