import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = resolve(root, 'lib')
mkdirSync(lib, { recursive: true })
for (const file of ['core.js', 'index.js', 'client.js']) {
  copyFileSync(resolve(root, 'src', file), resolve(lib, file))
}
console.log('Built lib/core.js, lib/index.js and lib/client.js')
