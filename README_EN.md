# dsh-subagent-model-picker

Per-conversation subagent model selection for DeepSeek Harness Desktop.

Install it as a normal DSH bundle. The package includes a Host interceptor, a browser composer selector, versioned persistent storage, and the `subagent_model_ctl` tool.

```text
dsh plugin --profile desktop add dsh-subagent-model-picker@0.1.0
```

The package targets the DSH `0.1.1-rc.2` service contracts and Node.js 20+. Run `npm run check` before publishing. Replace the placeholder repository owner in `package.json`, publish the package to npm, then submit the repository/package metadata to the DSH plugin center. npm publication and plugin-center catalog approval are separate steps.
