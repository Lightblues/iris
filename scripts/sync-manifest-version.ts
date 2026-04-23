// Sync manifest.json version from package.json.
// Runs automatically as the `version` npm lifecycle script during `pnpm version <bump>`,
// which fires after package.json is bumped but before the tag/commit is created.
// We rewrite manifest.json and `git add` it so it lands in the same version commit.
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifestPath = path.join(root, 'manifest.json')
const manifestRaw = fs.readFileSync(manifestPath, 'utf8')

const versionRe = /("version"\s*:\s*)"[^"]*"/
if (!versionRe.test(manifestRaw)) {
  console.error('sync-manifest-version: could not find top-level "version" field in manifest.json')
  process.exit(1)
}

// Preserve original formatting by only replacing the top-level "version" field.
const updated = manifestRaw.replace(versionRe, `$1"${pkg.version}"`)

if (updated !== manifestRaw) {
  fs.writeFileSync(manifestPath, updated)
  console.log(`sync-manifest-version: manifest.json -> ${pkg.version}`)
} else {
  console.log(`sync-manifest-version: manifest.json already at ${pkg.version}, no change`)
}

// Only stage if we're running inside `npm/pnpm version`, so plain invocations don't touch git.
if (process.env.npm_lifecycle_event === 'version') {
  execSync('git add manifest.json', { cwd: root, stdio: 'inherit' })
}
