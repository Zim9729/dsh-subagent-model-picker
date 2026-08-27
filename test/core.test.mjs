import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STORE_SCHEMA,
  catalogContains,
  entriesFromStore,
  ownedStoreSnapshot,
  selectionOf,
  sessionIdOf,
} from '../src/core.js'

test('normalizes valid selections and rejects oversized values', () => {
  assert.deepEqual(selectionOf('scnet', 'GLM-5.2'), { provider: 'scnet', model: 'GLM-5.2' })
  assert.equal(selectionOf('', 'GLM-5.2'), undefined)
  assert.equal(sessionIdOf('x'.repeat(257)), undefined)
  assert.equal(selectionOf('x'.repeat(129), 'GLM-5.2'), undefined)
})

test('validates selections against the live catalog', () => {
  const groups = [{ provider: 'scnet', models: ['GLM-5.2'] }]
  assert.equal(catalogContains(groups, { provider: 'scnet', model: 'GLM-5.2' }), true)
  assert.equal(catalogContains(groups, { provider: 'scnet', model: 'missing' }), false)
})

test('round-trips versioned storage and accepts legacy records', () => {
  const input = new Map([['session-a', { provider: 'scnet', model: 'GLM-5.2' }]])
  const stored = ownedStoreSnapshot(input)
  assert.equal(stored.schema, STORE_SCHEMA)
  assert.deepEqual(entriesFromStore(stored), [['session-a', { provider: 'scnet', model: 'GLM-5.2' }]])
  assert.deepEqual(entriesFromStore({ 'session-b': { provider: 'gw-90', model: 'qwen3.8-27b' } }), [['session-b', { provider: 'gw-90', model: 'qwen3.8-27b' }]])
  assert.deepEqual(entriesFromStore({ '__proto__': { provider: 'evil', model: 'ignored' } }), [])
})
