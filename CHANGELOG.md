# Changelog

## 0.2.0

- "子 agent 跟随默认" now means "follow the main agent's current model" instead of "use DSH global default".
- The UI default option shows the main agent's provider/model in real time.
- API `get` and `set` responses include `defaultProvider` and `defaultModel`.

## 0.1.1

- Publish under the `@zim9729` npm scope after the unscoped name was unavailable.
- Initial publishable DSH bundle.
- Per-conversation subagent model picker in the composer.
- Host-side request and system-prompt model override.
- Provider/model catalog validation.
- Atomic, versioned persistence with session cleanup.
- Same-origin local API with request validation and body limits.
- `subagent_model_ctl` model-facing control tool.
