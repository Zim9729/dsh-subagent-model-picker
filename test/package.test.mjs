import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('package declares a complete DSH bundle surface', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(pkg.name, '@zim9729/dsh-subagent-model-picker')
  assert.equal(pkg.version, '0.1.1')
})

test('bundle patch mounts the package host entry', async () => {
  const patch = await readFile(resolve(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id:\s+subagent-model-override/)
  assert.match(patch, /name:\s+'@zim9729\/dsh-subagent-model-picker'/)
})
