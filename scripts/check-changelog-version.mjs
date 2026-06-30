/**
 * Build guard: fails when the in-app "What's new" changelog hasn't been updated
 * to match the app version. Wired into the `build` script, so it runs before
 * every app build — local `package`/`release`, CI, and the release workflow's
 * per-OS matrix — and a release can never ship a stale What's new (as 1.1.1
 * nearly did: tagged + built while the changelog still topped out at 1.1.0).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const { version: appVersion } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const changelogSrc = readFileSync(join(root, 'src/shared/changelog.ts'), 'utf8')
// The first *quoted* version in the file is CHANGELOG[0].version (the
// `version: string` field on the interface is unquoted, so it's skipped).
const match = changelogSrc.match(/version:\s*['"]([^'"]+)['"]/)
if (!match) {
  console.error(
    '✖ changelog check: could not read the latest version from src/shared/changelog.ts.\n' +
      '  The file format may have changed — update scripts/check-changelog-version.mjs.'
  )
  process.exit(1)
}

const changelogVersion = match[1]
if (changelogVersion !== appVersion) {
  console.error(
    `✖ changelog check: package.json is ${appVersion}, but the in-app "What's new"\n` +
      `  top entry is ${changelogVersion}. Add a '${appVersion}' entry at the top of\n` +
      `  src/shared/changelog.ts (with the release date) before building or releasing.`
  )
  process.exit(1)
}

console.log(`✓ changelog check: in-app "What's new" is up to date for ${appVersion}.`)
