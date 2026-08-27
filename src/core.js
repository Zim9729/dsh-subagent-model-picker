export const STORE_SCHEMA = 1
export const MAX_SESSION_ID_LENGTH = 256
export const MAX_PROVIDER_LENGTH = 128
export const MAX_MODEL_LENGTH = 512

export function stringValue(value, maxLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined
}

export function selectionOf(provider, model) {
  const normalizedProvider = stringValue(provider, MAX_PROVIDER_LENGTH)
  const normalizedModel = stringValue(model, MAX_MODEL_LENGTH)
  if (normalizedProvider === undefined || normalizedModel === undefined) return undefined
  return { provider: normalizedProvider, model: normalizedModel }
}

export function sessionIdOf(value) {
  return stringValue(value, MAX_SESSION_ID_LENGTH)
}

export function catalogContains(groups, selection) {
  if (selection === undefined || !Array.isArray(groups)) return false
  const group = groups.find((item) => item && item.provider === selection.provider)
  return !!group && Array.isArray(group.models) && group.models.includes(selection.model)
}

export function ownedStoreSnapshot(overrides) {
  const output = { schema: STORE_SCHEMA, overrides: Object.create(null) }
  for (const [sessionId, selection] of overrides) {
    const normalized = selectionOf(selection?.provider, selection?.model)
    if (sessionIdOf(sessionId) !== undefined && normalized !== undefined) output.overrides[sessionId] = normalized
  }
  return output
}

export function entriesFromStore(raw) {
  if (!raw || typeof raw !== 'object') return []
  const source = raw.schema === STORE_SCHEMA && raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : raw
  return Object.entries(source).flatMap(([sessionId, selection]) => {
    const key = sessionIdOf(sessionId)
    const normalized = selectionOf(selection?.provider, selection?.model)
    return key !== undefined && normalized !== undefined ? [[key, normalized]] : []
  })
}
