import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  MAX_MODEL_LENGTH,
  MAX_PROVIDER_LENGTH,
  catalogContains,
  entriesFromStore,
  ownedStoreSnapshot,
  selectionOf,
  sessionIdOf,
} from './core.js'

export const name = 'subagent-model-override'
export const inject = ['sessions', 'settings', 'webServer', 'tools']

const MAX_BODY_BYTES = 64 * 1024
const MAX_CATALOG_GROUPS = 256
const MAX_CATALOG_MODELS = 4096

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function ownRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function loopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.length === 0 || hostHeader.length > 255) return undefined
  try {
    return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return undefined
  }
}

function isTrustedRequest(req) {
  const hostHeader = req.headers?.host
  const hostname = loopbackHost(hostHeader)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '::1') return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostHeader
  } catch {
    return false
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  const declaredLength = Number(req.headers?.['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    const error = new Error('request body too large')
    error.statusCode = 413
    return Promise.reject(error)
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const error = new Error('request body too large')
        error.statusCode = 413
        fail(error)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', fail)
    req.on('end', () => {
      if (settled) return
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        const value = raw.length === 0 ? {} : JSON.parse(raw)
        settled = true
        resolve(value)
      } catch (error) {
        error.statusCode = 400
        fail(error)
      }
    })
  })
}

function responseError(error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500
  return {
    statusCode,
    body: {
      ok: false,
      error: {
        code: statusCode === 400 ? 'bad-request' : statusCode === 413 ? 'payload-too-large' : 'error',
        message: errorMessage(error),
      },
    },
  }
}

function safePathHome() {
  try {
    return resolveDshHome()
  } catch {
    const configured = typeof process?.env?.DSH_HOME === 'string' && process.env.DSH_HOME.trim().length > 0
      ? process.env.DSH_HOME
      : join(homedir(), '.dsh')
    return configured
  }
}

function loadOverrides(storeFile) {
  try {
    if (!existsSync(storeFile)) return new Map()
    return new Map(entriesFromStore(JSON.parse(readFileSync(storeFile, 'utf8'))))
  } catch {
    return new Map()
  }
}

function persistOverrides(storeFile, overrides) {
  const directory = dirname(storeFile)
  mkdirSync(directory, { recursive: true })
  const temporary = join(directory, `.subagent-model-overrides.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, JSON.stringify(ownedStoreSnapshot(overrides), null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, storeFile)
  } catch (error) {
    try { unlinkSync(temporary) } catch { /* best effort */ }
    throw error
  }
}

function providerModels(settings) {
  let configured = {}
  try {
    const raw = settings.get('llm-pi-ai')
    if (ownRecord(raw) && ownRecord(raw.providers)) configured = raw.providers
  } catch {
    return {}
  }
  return configured
}

function buildCatalog(ctx) {
  const groups = []
  const displayNames = new Map()
  const llm = ctx.get('llm')
  try {
    const providers = llm && typeof llm.listConfigurableProviders === 'function' ? llm.listConfigurableProviders() : []
    if (Array.isArray(providers)) {
      for (const provider of providers) {
        if (provider && typeof provider.provider === 'string' && typeof provider.displayName === 'string') {
          displayNames.set(provider.provider, provider.displayName)
        }
      }
    }
  } catch {
    /* display names are optional */
  }

  let totalModels = 0
  const configured = providerModels(ctx.settings)
  for (const providerId of Object.keys(configured)) {
    if (groups.length >= MAX_CATALOG_GROUPS || totalModels >= MAX_CATALOG_MODELS) break
    const config = configured[providerId]
    if (!ownRecord(config)) continue
    const rawModels = Array.isArray(config.models) ? config.models : []
    const models = []
    for (const model of rawModels) {
      const id = typeof model === 'string' ? model : ownRecord(model) ? model.id : undefined
      if (typeof id !== 'string' || id.length === 0 || id.length > MAX_MODEL_LENGTH || models.includes(id)) continue
      models.push(id)
      totalModels += 1
      if (totalModels >= MAX_CATALOG_MODELS) break
    }
    if (models.length === 0 || providerId.length === 0 || providerId.length > MAX_PROVIDER_LENGTH) continue
    const configuredName = typeof config.displayName === 'string' ? config.displayName : undefined
    groups.push({
      provider: providerId,
      displayName: displayNames.get(providerId) || configuredName || providerId,
      models,
    })
  }
  return groups
}

function rootSessionId(sessions, sessionId) {
  let currentId = sessionId
  const seen = new Set()
  for (let depth = 0; depth < 100; depth += 1) {
    if (seen.has(currentId)) return undefined
    seen.add(currentId)
    const session = sessions.get(currentId)
    if (session === undefined) return undefined
    const parent = session.header?.parentSession
    if (typeof parent !== 'string' || parent.length === 0) return currentId
    currentId = parent
  }
  return undefined
}

function sessionFromAgent(agent) {
  const id = agent?.session?.header?.id
  return typeof id === 'string' ? id : undefined
}

function subagentHeader(header) {
  return !!header && (header.origin === 'subagent' || typeof header.parentSession === 'string')
}

export function apply(ctx) {
  const home = safePathHome()
  const storeDir = join(home, 'storages')
  const storeFile = join(storeDir, 'subagent-model-overrides.json')
  const overrides = loadOverrides(storeFile)
  const sessions = ctx.sessions
  let persistError = undefined

  const prune = () => {
    for (const sessionId of [...overrides.keys()]) {
      if (sessions.get(sessionId) === undefined) overrides.delete(sessionId)
    }
  }

  const save = () => {
    try {
      persistOverrides(storeFile, overrides)
      persistError = undefined
      return true
    } catch (error) {
      persistError = errorMessage(error)
      ctx.logger?.warn?.(`[dsh-subagent-model-picker] persistence failed: ${persistError}`)
      return false
    }
  }

  const selectionForSession = (sessionId) => {
    const root = rootSessionId(sessions, sessionId)
    return root === undefined ? { root: undefined, selection: undefined } : { root, selection: overrides.get(root) }
  }

  const catalog = () => buildCatalog(ctx)

  // Install the waterfalls for every child, then consult the live override at
  // request time. This avoids the race where a child is created before the UI
  // selection changes but sends its first request afterwards.
  ctx.on('agent/created', ({ agent }) => {
    const header = agent?.session?.header
    if (!subagentHeader(header)) return
    agent.ctx.on('agent/request', async (_payload, next) => {
      const resolved = await next()
      const childId = sessionFromAgent(agent)
      const current = childId === undefined ? undefined : selectionForSession(childId).selection
      return current === undefined ? resolved : { ...resolved, provider: current.provider, model: current.model }
    })
    agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembled = await next()
      const childId = sessionFromAgent(agent)
      const current = childId === undefined ? undefined : selectionForSession(childId).selection
      if (current === undefined) return assembled
      return {
        ...assembled,
        variables: { ...(assembled?.variables || {}), provider: current.provider, model: current.model },
      }
    })
  })

  ctx.on('session/disposed', (session) => {
    const id = session?.header?.id
    if (typeof id !== 'string' || typeof session.header.parentSession === 'string') return
    if (overrides.delete(id)) save()
  })

  const api = {
    get(payload) {
      if (!ownRecord(payload)) throw Object.assign(new Error('payload must be an object'), { statusCode: 400 })
      const requested = sessionIdOf(payload.sessionId)
      if (requested === undefined) throw Object.assign(new Error('invalid sessionId'), { statusCode: 400 })
      const resolved = selectionForSession(requested)
      if (resolved.root === undefined) throw Object.assign(new Error('session not found'), { statusCode: 404 })
      const current = resolved.selection
      return { sessionId: requested, rootSessionId: resolved.root, set: current !== undefined, provider: current?.provider || null, model: current?.model || null }
    },
    set(payload) {
      if (!ownRecord(payload)) throw Object.assign(new Error('payload must be an object'), { statusCode: 400 })
      const requested = sessionIdOf(payload.sessionId)
      if (requested === undefined) throw Object.assign(new Error('invalid sessionId'), { statusCode: 400 })
      const resolved = selectionForSession(requested)
      if (resolved.root === undefined) throw Object.assign(new Error('session not found'), { statusCode: 404 })
      const requestedSelection = selectionOf(payload.provider, payload.model)
      if (requestedSelection !== undefined) {
        if (!catalogContains(catalog(), requestedSelection)) {
          throw Object.assign(new Error('provider/model is not available in the current catalog'), { statusCode: 400 })
        }
        overrides.set(resolved.root, requestedSelection)
      } else if (payload.provider === undefined && payload.model === undefined) {
        overrides.delete(resolved.root)
      } else {
        throw Object.assign(new Error('provider and model must be supplied together'), { statusCode: 400 })
      }
      if (!save()) {
        if (requestedSelection !== undefined) {
          if (resolved.selection === undefined) overrides.delete(resolved.root)
          else overrides.set(resolved.root, resolved.selection)
        } else if (resolved.selection !== undefined) {
          overrides.set(resolved.root, resolved.selection)
        }
        throw Object.assign(new Error(`override was not persisted: ${persistError}`), { statusCode: 500 })
      }
      const current = overrides.get(resolved.root)
      return { sessionId: requested, rootSessionId: resolved.root, set: current !== undefined, provider: current?.provider || null, model: current?.model || null }
    },
    catalog() {
      return { groups: catalog() }
    },
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/subagent-model/api',
    handler: async (req, res) => {
      if (!isTrustedRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      let method
      try {
        const pathname = new URL(req.url || '/', 'http://dsh.internal').pathname
        const prefix = '/subagent-model/api/'
        method = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined
      } catch {
        method = undefined
      }
      if (method === undefined || method.includes('/') || !Object.hasOwn(api, method)) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method' } })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const value = await api[method](payload)
        writeJson(res, 200, { ok: true, value })
      } catch (error) {
        const failure = responseError(error)
        writeJson(res, failure.statusCode, failure.body)
      }
    },
  }), 'dsh-subagent-model-picker: /subagent-model/api routes')

  ctx.tools.register(defineTool({
    name: 'subagent_model_ctl',
    description: 'Get, set, or clear the per-conversation subagent model override. Child agents inherit the selected provider/model.',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'set', 'clear'] },
      sessionId: { type: 'string', description: 'A live conversation or child session. Defaults to the calling agent session.' },
      provider: { type: 'string', description: 'Provider id, required for set.' },
      model: { type: 'string', description: 'Model id, required for set.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          rootSessionId: { type: 'string', required: true },
          set: { type: 'boolean', required: true },
          provider: { type: 'string' },
          model: { type: 'string' },
        },
      },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    execute(args, exec) {
      const callingId = sessionFromAgent(exec?.agent)
      const requestedId = sessionIdOf(args.sessionId) || callingId
      if (requestedId === undefined) throw new Error('no live calling session')
      if (args.action === 'set') {
        return api.set({ sessionId: requestedId, provider: args.provider, model: args.model })
      }
      if (args.action === 'clear') return api.set({ sessionId: requestedId })
      return api.get({ sessionId: requestedId })
    },
  }))

}
