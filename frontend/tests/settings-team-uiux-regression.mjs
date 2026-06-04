import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const settingsModal = readFileSync(resolve(root, 'components/SettingsModal.tsx'), 'utf8')
const settingsTabSwitcher = readFileSync(resolve(root, 'components/settings-modal/SettingsTabSwitcher.tsx'), 'utf8')
const teamSettings = readFileSync(resolve(root, 'components/settings-modal/TeamSettingsTab.tsx'), 'utf8')

assert.match(settingsModal, /<SettingsTabSwitcher tab=\{tab\} onChange=\{setTab\} \/>[\s\S]*tab === 'provider'/)
assert.match(settingsModal, /initialTeamId\?: string/)
assert.match(settingsModal, /initialTeamId=\{initialTeamId\}/)
assert.doesNotMatch(settingsModal, /settings-nav shrink-0/)
assert.match(settingsTabSwitcher, /w-\[220px\]/)
assert.match(settingsTabSwitcher, /border-r border-line/)
assert.match(settingsTabSwitcher, />设置</)
assert.match(settingsTabSwitcher, /hint: '成员、分工、规则'/)
assert.match(settingsTabSwitcher, /Bolt/)
assert.match(settingsTabSwitcher, /Layers/)
assert.match(settingsTabSwitcher, /ChevronRight/)
assert.match(settingsTabSwitcher, /关闭后回到当前页面/)

assert.match(teamSettings, /lg:grid-cols-\[250px_minmax\(0,1fr\)\]/)
assert.match(teamSettings, /Team · \{localTeams\.length\}/)
assert.match(teamSettings, /font-display text-\[28px\]/)
assert.match(teamSettings, /max-A2A \{activeVersion\.maxA2ADepth \?\? 5\}/)
assert.doesNotMatch(teamSettings, /克隆为新 Team/)
assert.doesNotMatch(teamSettings, /把当前 Provider 应用到全员/)
assert.doesNotMatch(teamSettings, /applyProviderToCurrentTeam/)
assert.doesNotMatch(teamSettings, /新建 Team 即将开放/)
assert.match(teamSettings, /TEAM_SUBTABS/)
assert.match(teamSettings, /activeSubtab/)
assert.match(teamSettings, /setActiveSubtab/)
assert.match(teamSettings, /成员（\{members\.length\}）/)
assert.match(teamSettings, /分工 & 规则/)
assert.match(teamSettings, /长期记忆/)
assert.doesNotMatch(teamSettings, /历史版本/)
assert.match(teamSettings, /activeSubtab === 'rules'/)
assert.match(teamSettings, /团队协作说明/)
assert.doesNotMatch(teamSettings, /协作路由规则/)
assert.doesNotMatch(teamSettings, /saveRoutingRules/)
assert.match(teamSettings, /version: \{ workflowPrompt: value \}/)
assert.doesNotMatch(teamSettings, /Team 默认 A2A 深度/)
assert.doesNotMatch(teamSettings, /TEAM_DEPTH_OPTIONS/)
assert.doesNotMatch(teamSettings, /version: \{ maxA2ADepth: depth \}/)
assert.match(teamSettings, /activeSubtab === 'memory'/)
assert.match(teamSettings, /Team 长期记忆/)
assert.match(teamSettings, /saveTeamMemory/)
assert.match(teamSettings, /version: \{ teamMemory: nextMemory \}/)
assert.match(teamSettings, /AgentAvatar/)
assert.match(teamSettings, /initialTeamId/)
assert.match(teamSettings, /setSelectedTeamId\(initialTeamId\)/)
assert.match(
  teamSettings,
  /if \(initialTeamId && localTeams\.some\(team => team\.id === initialTeamId\)\) return[\s\S]*setSelectedTeamId\(localTeams\[0\]\?\.id \?\? ''\)/,
  'Default Team selection must not override the requested initialTeamId.',
)
assert.match(teamSettings, /getAgentColor/)
assert.match(teamSettings, /member-card/)
assert.match(teamSettings, /member-card-refined/)
assert.match(teamSettings, /member-card-accent/)
assert.match(teamSettings, /member-field-panel/)
assert.match(teamSettings, /role-soul-field/)
assert.match(teamSettings, /member-provider-select/)
assert.match(teamSettings, /member-toolbar/)
assert.match(teamSettings, /member-action-bar/)
assert.match(teamSettings, /role-soul-edit/)
assert.match(teamSettings, /member-field-grid/)
assert.match(teamSettings, /member-field-label/)
assert.doesNotMatch(teamSettings, /border-y border-r border-l-\[3px\]/)
assert.match(teamSettings, /w-\[8\.75rem\]/)
assert.doesNotMatch(teamSettings, /member-focus-field/)
assert.doesNotMatch(teamSettings, /rounded-full border border-line bg-surface-muted px-1\.5 py-1/)
assert.doesNotMatch(teamSettings, /displayLabel="角色灵魂"/)
assert.match(teamSettings, /alwaysUseDialog/)
assert.match(teamSettings, /member-card-compact/)
assert.match(teamSettings, /displayLabel=\{roleLabel \|\| '未设置角色分工'\}/)
assert.match(teamSettings, /member-field-grid[^"]*xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,1\.2fr\)\]/)
assert.doesNotMatch(teamSettings, /成员名称：给这个成员起一个好识别的名字/)
assert.doesNotMatch(teamSettings, /角色分工：一句话说明它在 Team 里的身份/)
assert.match(
  teamSettings,
  /placeholder="负责什么"[\s\S]*?alwaysUseDialog[\s\S]*?longTextDialogTitle="编辑负责什么"/,
  'Responsibility should use the same three-line preview and click-to-edit dialog pattern.',
)
assert.match(
  teamSettings,
  /placeholder="什么时候用它"[\s\S]*?alwaysUseDialog[\s\S]*?longTextDialogTitle="编辑什么时候用它"/,
  'When-to-use should use the same three-line preview and click-to-edit dialog pattern.',
)
assert.match(teamSettings, /角色灵魂/)
assert.ok(
  teamSettings.indexOf('role-soul-field') > teamSettings.indexOf('member-field-grid'),
  'Role soul should live with the member detail fields, not in the header action strip.',
)
assert.doesNotMatch(teamSettings, /member-edit-strip/)
assert.doesNotMatch(teamSettings, /group-hover:(?:opacity|text)/)
assert.doesNotMatch(teamSettings, /hover:shadow-\[/)
assert.doesNotMatch(teamSettings, /详细工作说明/)
assert.doesNotMatch(teamSettings, /移除成员建设中/)
assert.match(teamSettings, /负责什么/)
assert.match(teamSettings, /什么时候用它/)
assert.doesNotMatch(teamSettings, /lg:grid-cols-\[minmax\(14rem,18rem\)_1fr\]/)
assert.doesNotMatch(teamSettings, /<h3 className="text-\[13px\] font-bold text-ink">Team 信息<\/h3>/)
assert.doesNotMatch(teamSettings, /<h3 className="text-\[13px\] font-bold text-ink">Team 分工<\/h3>/)

console.log('settings-team-uiux-regression: ok')
