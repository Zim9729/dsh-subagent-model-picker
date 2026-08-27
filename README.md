# dsh-subagent-model-picker

Per-conversation subagent model selection for DeepSeek Harness Desktop.

## Features

- Adds a `子 agent 模型` selector beside the conversation composer send controls.
- Lists configured provider/model pairs from the `llm-pi-ai` settings namespace.
- Applies the selected provider/model to `subagent`, `subagent_fork`, and workflow child agents.
- Keeps the override at the root conversation when a child session is addressed.
- Restores the override after restart from the DSH home storage directory.
- Provides the `subagent_model_ctl` model tool with `get`, `set`, and `clear` actions.
- Uses a same-origin loopback API with session, model, method, and request-size validation.

## Install

Install through the DSH profile/plugin manager after publishing the npm package:

```text
dsh plugin --profile desktop add @zim9729/dsh-subagent-model-picker@0.1.1
```

The package declares both `dsh.bundle.patch` and `dsh.client`, so the Host entry and browser entry are mounted by the normal DSH bundle pipeline. Restart DSH after installation when the installer reports that a restart is required. The package's bundle patch is the only required mount; do not duplicate it in a profile patch file. Because this release uses the `@zim9729` npm scope, keep the scope in the install command and plugin-center registry entry.

Do not add a second manual row for this package to the profile's `cordis.patch.yml`; the package's own bundle patch already mounts its row.

## Storage

Overrides are stored in:

```text
<DSH_HOME>/storages/subagent-model-overrides.json
```

The file contains a versioned JSON object keyed by root conversation session ID. Invalid or stale records are ignored and stale records are removed when the corresponding session is disposed.

## Compatibility

The first release targets DSH `0.1.1-rc.2` service contracts and Node.js 20 or newer. The package uses DSH peer dependencies rather than bundling the Host runtime. Replace the placeholder GitHub owner in `package.json` before publishing.

## Development

```text
npm install
npm run check
npm pack
```

`npm run check` builds the three distributable JavaScript files, runs the pure helper tests, and performs an npm dry-run package check.

## Publishing

1. Push this repository to GitHub.
2. Run `npm publish` from a clean tagged commit.
3. Submit the npm package/repository URL to the DSH plugin center registry according to its contribution process.

The plugin center catalog and npm publication are separate operations; publishing to npm alone does not automatically add the package to a curated registry.

## Security and limitations

The local API accepts only loopback same-origin browser requests. If DSH is intentionally exposed through a non-loopback reverse proxy, the picker will remain unavailable unless the trust policy is extended in a future release. Model credentials are never read or returned by this plugin.
