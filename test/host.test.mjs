import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../src/index.js'

function makeHost() {
  const listeners = new Map()
  const routes = []
  const tools = []
  const settings = {
    get() {
      return {
        providers: {
          scnet: { models: ['GLM-5.2'] },
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
  assert.deepEqual(get.body.value, {
    sessionId: 'root-session',
    rootSessionId: 'root-session',
    set: true,
    provider: 'scnet',
    model: 'GLM-5.2',
  })

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

test('Host API rejects unknown models and cross-site requests', async () => {
  const host = makeHost()
  const route = host.routes[0]
  const invalid = await callRoute(route, { sessionId: 'root-session', provider: 'scnet', model: 'missing' })
  assert.equal(invalid.status, 400)
  const forbidden = await callRoute(route, { sessionId: 'root-session' }, '/subagent-model/api/get', { 'sec-fetch-site': 'cross-site' })
  assert.equal(forbidden.status, 403)
})
