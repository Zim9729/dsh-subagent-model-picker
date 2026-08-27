import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'

const testHome = mkdtempSync(join(tmpdir(), 'dsm-test-'))
process.env.DSH_HOME = testHome
test.after(() => rmSync(testHome, { recursive: true, force: true }))

function makeHost() {
  const home = mkdtempSync(join(tmpdir(), 'dsm-'))
  process.env.DSH_HOME = home
  const listeners = new Map()
  const routes = []
  const tools = []
  const settings = {
    get() {
      return {
        providers: {
          scnet: { models: ['GLM-5.2', 'DeepSeek-V4-Pro-0813'] },
        },
      }
    },
  }
  const sessionsById = new Map([
    ['root-session', { header: { id: 'root-session' } }],
    ['child-session', { header: { id: 'child-session', parentSession: 'root-session', origin: 'subagent' } }],
  ])
  const ctx = {
    sessions: { get: (id) => sessionsById.get(id) },
    settings,
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    tools: {
      register(definition) {
        tools.push(definition)
        return () => {}
      },
    },
    logger: { warn() {} },
    get(name) {
      return name === 'llm' ? { listConfigurableProviders: () => [{ provider: 'scnet', displayName: 'scnet' }] } : undefined
    },
    on(name, handler) {
      listeners.set(name, handler)
      return () => listeners.delete(name)
    },
    effect(effect) {
      return effect()
    },
  }
  apply(ctx)
  return { listeners, routes, tools, sessionsById }
}

function response() {
  return {
    status: undefined,
    body: undefined,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = JSON.parse(body)
    },
  }
}

/** Agent ctx that records listener registration order and honors `prepend`. */
function makeAgentCtx() {
  const handlers = []
  return {
    handlers,
    ctx: {
      on(name, handler, options) {
        const prepend = options === true || (options && options.prepend)
        handlers[prepend ? 'unshift' : 'push']({ name, handler })
        return () => {}
      },
    },
  }
}

/** Dispatch a Cordis-style waterfall outermost-first over handler functions. */
async function runWaterfall(handlers, initial) {
  let index = 0
  const next = async () => {
    const handler = handlers[index++]
    return handler ? handler({}, next) : initial
  }
  return next()
}

function request(payload, url = '/subagent-model/api/set', extraHeaders = {}) {
  const body = JSON.stringify(payload)
  const listeners = {}
  return {
    method: 'POST',
    url,
    headers: { host: '127.0.0.1:43120', 'content-length': String(Buffer.byteLength(body)), ...extraHeaders },
    on(event, handler) {
      listeners[event] = handler
      if (event === 'data') queueMicrotask(() => handler(Buffer.from(body)))
      if (event === 'end') queueMicrotask(() => handler())
    },
  }
}

async function callRoute(route, payload, url = '/subagent-model/api/set', headers = {}) {
  const res = response()
  await route.handler(request(payload, url, headers), res)
  return res
}

test('Host API validates, persists, and normalizes child session requests', async () => {
  const host = makeHost()
  const route = host.routes[0]
  const set = await callRoute(route, { sessionId: 'child-session', provider: 'scnet', model: 'GLM-5.2' })
  assert.equal(set.status, 200)
  assert.equal(set.body.value.rootSessionId, 'root-session')

  const get = await callRoute(host.routes[0], { sessionId: 'root-session' }, '/subagent-model/api/get')
  assert.equal(get.body.value.sessionId, 'root-session')
  assert.equal(get.body.value.rootSessionId, 'root-session')
  assert.equal(get.body.value.set, true)
  assert.equal(get.body.value.provider, 'scnet')
  assert.equal(get.body.value.model, 'GLM-5.2')

  const created = host.listeners.get('agent/created')
  const requestHandlers = new Map()
  const childAgent = {
    session: { header: { id: 'child-session', parentSession: 'root-session', origin: 'subagent' } },
    ctx: { on(name, handler) { requestHandlers.set(name, handler); return () => {} } },
  }
  created({ agent: childAgent })
  const resolved = await requestHandlers.get('agent/request')({}, async () => ({ provider: 'old', model: 'old' }))
  assert.deepEqual(resolved, { provider: 'scnet', model: 'GLM-5.2' })
})

test('subagent follows main agent model when no override is set', async () => {
  const host = makeHost()
  const created = host.listeners.get('agent/created')

  // Create root agent and simulate a request to capture its model
  const rootHandlers = new Map()
  const rootAgent = {
    session: { header: { id: 'root-session' } },
    ctx: { on(name, handler) { rootHandlers.set(name, handler); return () => {} } },
  }
  created({ agent: rootAgent })
  await rootHandlers.get('agent/request')({}, async () => ({ provider: 'scnet', model: 'DeepSeek-V4-Pro-0813' }))

  // Create child agent without any override
  const childHandlers = new Map()
  const childAgent = {
    session: { header: { id: 'child-session', parentSession: 'root-session', origin: 'subagent' } },
    ctx: { on(name, handler) { childHandlers.set(name, handler); return () => {} } },
  }
  created({ agent: childAgent })
  const resolved = await childHandlers.get('agent/request')({}, async () => ({ provider: 'preset', model: 'preset-model' }))
  assert.deepEqual(resolved, { provider: 'scnet', model: 'DeepSeek-V4-Pro-0813' })
})

test('explicit override takes precedence over main agent model', async () => {
  const host = makeHost()
  const route = host.routes[0]
  const created = host.listeners.get('agent/created')

  // Capture root model
  const rootHandlers = new Map()
  const rootAgent = {
    session: { header: { id: 'root-session' } },
    ctx: { on(name, handler) { rootHandlers.set(name, handler); return () => {} } },
  }
  created({ agent: rootAgent })
  await rootHandlers.get('agent/request')({}, async () => ({ provider: 'scnet', model: 'DeepSeek-V4-Pro-0813' }))

  // Set an explicit override
  const set = await callRoute(route, { sessionId: 'root-session', provider: 'scnet', model: 'GLM-5.2' })
  assert.equal(set.status, 200)

  // Child agent should use the override, not the main model
  const childHandlers = new Map()
  const childAgent = {
    session: { header: { id: 'child-session', parentSession: 'root-session', origin: 'subagent' } },
    ctx: { on(name, handler) { childHandlers.set(name, handler); return () => {} } },
  }
  created({ agent: childAgent })
  const resolved = await childHandlers.get('agent/request')({}, async () => ({ provider: 'preset', model: 'preset-model' }))
  assert.deepEqual(resolved, { provider: 'scnet', model: 'GLM-5.2' })
})

test('get API returns defaultProvider and defaultModel', async () => {
  const host = makeHost()
  const created = host.listeners.get('agent/created')

  const rootHandlers = new Map()
  const rootAgent = {
    session: { header: { id: 'root-session' } },
    ctx: { on(name, handler) { rootHandlers.set(name, handler); return () => {} } },
  }
  created({ agent: rootAgent })
  await rootHandlers.get('agent/request')({}, async () => ({ provider: 'scnet', model: 'DeepSeek-V4-Pro-0813' }))

  const get = await callRoute(host.routes[0], { sessionId: 'root-session' }, '/subagent-model/api/get')
  assert.equal(get.body.value.defaultProvider, 'scnet')
  assert.equal(get.body.value.defaultModel, 'DeepSeek-V4-Pro-0813')
})

test('Host API rejects unknown models and cross-site requests', async () => {
  const host = makeHost()
  const route = host.routes[0]
  const invalid = await callRoute(route, { sessionId: 'root-session', provider: 'scnet', model: 'missing' })
  assert.equal(invalid.status, 400)
  const forbidden = await callRoute(host.routes[0], { sessionId: 'root-session' }, '/subagent-model/api/get', { 'sec-fetch-site': 'cross-site' })
  assert.equal(forbidden.status, 403)
})

test('root capture is prepended and reads the final resolved config', async () => {
  const host = makeHost()
  const created = host.listeners.get('agent/created')

  // The host's own model-selection waterfall (installModelSelection) registers
  // during agent setup — BEFORE agent/created — and applies its override last
  // when it is NOT prepended. Simulate that outer handler.
  const root = makeAgentCtx()
  root.ctx.on('agent/request', async (_payload, next) => {
    const resolved = await next()
    return { ...resolved, provider: 'selected-provider', model: 'selected-model' }
  })
  created({ agent: { session: { header: { id: 'root-session' } }, ctx: root.ctx } })

  const requestHandlers = root.handlers.filter((entry) => entry.name === 'agent/request')
  assert.equal(requestHandlers.length, 2)

  const final = await runWaterfall(
    requestHandlers.map((entry) => entry.handler),
    { provider: 'raw', model: 'raw' },
  )
  // The outer selection handler runs inside next() and wins for the request.
  assert.deepEqual(final, { provider: 'selected-provider', model: 'selected-model' })

  // The capture must have recorded the FINAL config, not the raw seed.
  const get = await callRoute(host.routes[0], { sessionId: 'root-session' }, '/subagent-model/api/get')
  assert.equal(get.body.value.defaultProvider, 'selected-provider')
  assert.equal(get.body.value.defaultModel, 'selected-model')
})

test('subagent override is prepended so it wins over the host selection', async () => {
  const host = makeHost()
  const created = host.listeners.get('agent/created')

  // Root: capture a main model via a prepended handler.
  const root = makeAgentCtx()
  created({ agent: { session: { header: { id: 'root-session' } }, ctx: root.ctx } })
  const rootRequest = root.handlers.filter((entry) => entry.name === 'agent/request')
  await runWaterfall(
    rootRequest.map((entry) => entry.handler),
    { provider: 'scnet', model: 'DeepSeek-V4-Pro-0813' },
  )

  // Child: the host's selection waterfall registered first (setup), our
  // override registered later and must be PREPENDED (outermost) so its
  // replacement is the final word instead of being overwritten.
  const child = makeAgentCtx()
  child.ctx.on('agent/request', async (_payload, next) => {
    const resolved = await next()
    return { ...resolved, provider: 'subagent-default', model: 'subagent-default' }
  })
  created({ agent: { session: { header: { id: 'child-session', parentSession: 'root-session', origin: 'subagent' } }, ctx: child.ctx } })

  const childRequest = child.handlers.filter((entry) => entry.name === 'agent/request')
  assert.equal(childRequest.length, 2)

  const final = await runWaterfall(
    childRequest.map((entry) => entry.handler),
    { provider: 'preset', model: 'preset-model' },
  )
  // The subagent's own default must NOT win: the prepended plugin override
  // replaces it with the main agent's model.
  assert.deepEqual(final, { provider: 'scnet', model: 'DeepSeek-V4-Pro-0813' })
})

test('tool output schema admits null provider/model when unset', async () => {
  const host = makeHost()
  const tool = host.tools.find((definition) => definition.name === 'subagent_model_ctl')
  assert.ok(tool)
  const properties = tool.output.schema.properties
  for (const key of ['provider', 'model', 'defaultProvider', 'defaultModel']) {
    assert.deepEqual(properties[key].oneOf, [{ type: 'string' }, { type: 'null' }])
  }
})
