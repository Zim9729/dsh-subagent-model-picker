# Changelog

## 0.2.3

- Fix: "Follow main agent" now captures the main agent's model after the host's
  model-selection waterfall applies it (handlers are prepended), so subagents
  follow the model picked in the GUI instead of the raw agent options.
- Fix: `subagent_model_ctl` output schema accepts `null` provider/model when no
  override is set.

## 0.2.2

- Fix: client bundle registers under the scoped package name `@zim9729/dsh-subagent-model-picker`.

## 0.2.1

- All UI strings switched to English.

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
