window.__ModuleLoader__.load({
  id: '@zim9729/dsh-subagent-model-picker',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const CSS = '.dsm-picker{display:inline-flex;align-items:center;gap:4px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary,#888);white-space:nowrap}.dsm-picker select{max-width:210px;min-width:92px;font:inherit;background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 6px;color:inherit;cursor:pointer}.dsm-picker select:hover{border-color:var(--dsw-alias-border-l2,#d0d0d0)}.dsm-picker select:disabled{opacity:.65;cursor:wait}.dsm-picker-error{color:var(--dsw-alias-label-tertiary,#999);font-size:11px}'
    const CSS_ID = 'dsh-subagent-model-picker/composer'

    function addStyles() {
      if (typeof document === 'undefined') return () => {}
      const selector = `style[data-plugin-css="${CSS_ID}"]`
      const existing = document.querySelector(selector)
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-subagent-model-picker'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    async function call(method, payload) {
      const response = await fetch(`/subagent-model/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      })
      const parsed = await response.json().catch(() => null)
      if (!response.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error?.message || `HTTP ${response.status}`)
      }
      return parsed.value
    }

    function optionValue(provider, model) {
      return JSON.stringify({ provider, model })
    }

    function parseOptionValue(value) {
      if (value === '') return null
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed.provider === 'string' && typeof parsed.model === 'string' ? parsed : null
      } catch {
        return null
      }
    }

    function SubagentModelPicker({ sessionId }) {
      const [state, setState] = React.useState({ loading: true, saving: false, groups: [], current: null, defaultProvider: null, defaultModel: null, error: null })

      React.useEffect(() => {
        let cancelled = false
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          setState({ loading: false, saving: false, groups: [], current: null, defaultProvider: null, defaultModel: null, error: 'No session available' })
          return () => { cancelled = true }
        }
        Promise.all([call('catalog', {}), call('get', { sessionId })])
          .then(([catalog, current]) => {
            if (cancelled) return
            setState({
              loading: false,
              saving: false,
              groups: Array.isArray(catalog?.groups) ? catalog.groups : [],
              current: current?.set ? { provider: current.provider, model: current.model } : null,
              defaultProvider: current?.defaultProvider || null,
              defaultModel: current?.defaultModel || null,
              error: null,
            })
          })
          .catch((error) => {
            if (!cancelled) setState((previous) => ({ ...previous, loading: false, error: error.message || 'Failed to load' }))
          })
        return () => { cancelled = true }
      }, [sessionId])

      const selected = state.current ? optionValue(state.current.provider, state.current.model) : ''
      const onChange = (event) => {
        const next = parseOptionValue(event.target.value)
        const previous = state.current
        setState((current) => ({ ...current, saving: true, error: null }))
        call('set', next ? { sessionId, provider: next.provider, model: next.model } : { sessionId })
          .then((result) => {
            setState((current) => ({
              ...current,
              saving: false,
              current: result?.set ? { provider: result.provider, model: result.model } : null,
              defaultProvider: result?.defaultProvider || current.defaultProvider,
              defaultModel: result?.defaultModel || current.defaultModel,
              error: null,
            }))
          })
          .catch((error) => {
            setState((current) => ({ ...current, saving: false, current: previous, error: error.message || 'Failed to save' }))
          })
      }

      if (state.loading) return React.createElement('span', { className: 'dsm-picker' }, 'Subagent model…')
      if (state.error && state.groups.length === 0) {
        return React.createElement('span', { className: 'dsm-picker-error', title: state.error }, 'Subagent model unavailable')
      }
      if (state.groups.length === 0) return null

      const defaultLabel = state.defaultProvider && state.defaultModel
        ? `Follow main agent (${state.defaultProvider} / ${state.defaultModel})`
        : 'Follow main agent'
      const children = [React.createElement('option', { key: '__default', value: '' }, defaultLabel)]
      for (const group of state.groups) {
        if (!group || typeof group.provider !== 'string' || !Array.isArray(group.models)) continue
        const options = group.models.map((model) => React.createElement(
          'option',
          { key: optionValue(group.provider, model), value: optionValue(group.provider, model) },
          `${group.displayName || group.provider} / ${model}`,
        ))
        children.push(React.createElement('optgroup', { key: group.provider, label: group.displayName || group.provider }, options))
      }

      return React.createElement(
        'span',
        { className: 'dsm-picker', title: state.error || 'Subagent model' },
        React.createElement('select', {
          value: selected,
          onChange,
          disabled: state.saving,
          'aria-label': 'Subagent model',
          'aria-busy': state.saving ? 'true' : 'false',
        }, children),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      ctx.effect(addStyles)
      ctx.effect(() => slots.inject('conversation.input.right', () => slots.register(
        { name: 'conversation.input.right', id: 'subagent-model-picker', order: 500, label: 'Subagent model' },
        (props) => React.createElement(SubagentModelPicker, { sessionId: props?.sessionId }),
      )))
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
