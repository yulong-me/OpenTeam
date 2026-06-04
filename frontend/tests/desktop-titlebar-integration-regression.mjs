import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(frontendRoot, '..')

const globals = readFileSync(resolve(frontendRoot, 'app/globals.css'), 'utf8')
const sidebar = readFileSync(resolve(frontendRoot, 'components/RoomListSidebar.tsx'), 'utf8')
const header = readFileSync(resolve(frontendRoot, 'components/room-view/RoomHeader.tsx'), 'utf8')
const main = readFileSync(resolve(root, 'desktop/main.cjs'), 'utf8')
const launcherTest = readFileSync(resolve(root, 'tests/desktop-launcher.test.mjs'), 'utf8')

assert.match(globals, /--desktop-titlebar-height:\s*52px/)
assert.match(globals, /-webkit-app-region:\s*drag/)
assert.match(globals, /-webkit-app-region:\s*no-drag/)

assert.match(main, /titleBarStyle:\s*'hiddenInset'/)
assert.match(main, /trafficLightPosition:\s*\{\s*x:\s*24,\s*y:\s*24\s*\}/)

assert.match(sidebar, /data-testid="desktop-titlebar-spacer"/)
assert.match(sidebar, /desktop-titlebar-drag h-\[var\(--desktop-titlebar-height\)\]/)
assert.match(sidebar, /pl-\[88px\]/)
assert.doesNotMatch(
  sidebar,
  /desktop-titlebar-drag[\s\S]{0,240}<SidebarBrand \/>/,
  'desktop titlebar should be a window-control spacer, not a duplicate OpenTeam brand',
)
assert.doesNotMatch(sidebar, /本机工作区|本级工作区/)

assert.match(header, /desktop-titlebar-drag/)
assert.match(header, /desktop-titlebar-no-drag/)

assert.match(launcherTest, /titleBarStyle:\\s\*'hiddenInset'/)
assert.match(launcherTest, /trafficLightPosition:\\s\*\\\{\\s\*x:\\s\*24,\\s\*y:\\s\*24\\s\*\\\}/)

console.log('desktop-titlebar-integration-regression: ok')
