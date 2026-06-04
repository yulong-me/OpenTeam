'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Ban, Check, ChevronLeft, ChevronRight, Info, Loader2, RefreshCcw, UserRound, X } from 'lucide-react'

import type { EvolutionChangeDecision, EvolutionProposal, EvolutionProposalChange } from './types'

const CHANGE_KIND_LABELS: Record<EvolutionProposalChange['kind'], string> = {
  'add-agent': '成员调整',
  'edit-agent-prompt': '成员调整',
  'edit-team-workflow': '协作规则',
  'add-team-memory': '长期记忆',
  'add-validation-case': '效果检查',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compactText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return JSON.stringify(value)
}

function cardChangeKindLabel(change: EvolutionProposalChange): string {
  return CHANGE_KIND_LABELS[change.kind] ?? '建议'
}

function changeSummary(change: EvolutionProposalChange, side: 'before' | 'after'): { title: string; detail: string } {
  const value = side === 'before' ? change.before : change.after

  if (change.kind === 'add-agent') {
    if (side === 'before') {
      return {
        title: '当前：还没有这个成员',
        detail: '现有团队需要由其他成员兼顾这部分职责。',
      }
    }
    const after = isRecord(value) ? value : {}
    const name = textField(after.name) || '新成员'
    const roleLabel = textField(after.roleLabel)
    const responsibility = textField(after.responsibility)
    return {
      title: `升级后：${name}${roleLabel ? ` 接管${roleLabel}` : ''}`,
      detail: responsibility || '补齐这部分专职分工。',
    }
  }

  if (change.kind === 'edit-agent-prompt') {
    const after = isRecord(value) ? value : {}
    const prompt = side === 'after' ? textField(after.systemPrompt) : compactText(value)
    return {
      title: side === 'before' ? '当前：成员要求不够清晰' : '升级后：成员要求更明确',
      detail: prompt || change.impact,
    }
  }

  if (change.kind === 'edit-team-workflow') {
    const after = isRecord(value) ? value : {}
    return {
      title: side === 'before' ? '当前：协作说明' : '升级后：协作说明',
      detail: (side === 'after' ? textField(after.workflowPrompt) || compactText(value) : compactText(value)) || change.impact,
    }
  }

  if (change.kind === 'add-team-memory') {
    return {
      title: side === 'before' ? '当前：未沉淀这条记忆' : '升级后：写入长期记忆',
      detail: compactText(value) || change.impact,
    }
  }

  return {
    title: side === 'before' ? '当前：没有这条检查' : '升级后：新增效果检查',
    detail: compactText(value) || change.impact,
  }
}

function decisionText(decision: EvolutionProposalChange['decision']): string {
  if (decision === 'accepted') return '已采纳'
  if (decision === 'rejected') return '不采纳'
  return '待处理'
}

function friendlyErrorText(error?: string | null): string | null {
  if (!error) return null

  const normalized = error.toLowerCase()
  if (normalized.includes('network') || normalized.includes('fetch')) return '网络连接不稳定，刚才的操作没有完成，请稍后再试。'
  if (normalized.includes('timeout') || normalized.includes('timed out')) return '等待时间过长，刚才的操作没有完成，请稍后再试。'
  if (normalized.includes('401') || normalized.includes('403') || normalized.includes('permission')) return '当前账号没有权限完成这个操作，请检查权限后再试。'
  if (normalized.includes('404') || normalized.includes('not found')) return '这次升级内容已经不存在或已被处理，请刷新后再看。'
  if (normalized.includes('409') || normalized.includes('conflict') || normalized.includes('stale')) return '这次升级状态已经变化，请刷新后再操作。'
  return '刚才的操作没有完成，请稍后重试。'
}

function selectNextPendingChangeId(changes: EvolutionProposalChange[], currentChangeId?: string): string | undefined {
  const pendingChanges = changes.filter(change => !change.decision)
  if (pendingChanges.length === 0) return undefined
  const currentIndex = changes.findIndex(change => change.id === currentChangeId)
  const orderedChanges = currentIndex >= 0
    ? [...changes.slice(currentIndex + 1), ...changes.slice(0, currentIndex + 1)]
    : changes
  return orderedChanges.find(change => !change.decision)?.id ?? pendingChanges[0]?.id
}

interface EvolutionReviewModalProps {
  proposal: EvolutionProposal
  teamName?: string
  decidingChangeId?: string | null
  merging: boolean
  rejecting?: boolean
  regenerating?: boolean
  error?: string | null
  onClose: () => void
  onDecide: (changeId: string, decision: EvolutionChangeDecision) => Promise<void>
  onMerge: () => Promise<void>
  onReject: () => Promise<void>
  onRegenerate: (feedback: string) => Promise<void>
}

export function EvolutionReviewModal({
  proposal,
  teamName,
  decidingChangeId,
  merging,
  rejecting = false,
  regenerating = false,
  error,
  onClose,
  onDecide,
  onMerge,
  onReject,
  onRegenerate,
}: EvolutionReviewModalProps) {
  const focusTrapRef = useRef<HTMLDivElement>(null)
  const [activeChangeId, setActiveChangeId] = useState(proposal.changes[0]?.id)
  const [regenerationFeedback, setRegenerationFeedback] = useState('')
  const [regenerationOpen, setRegenerationOpen] = useState(false)

  useEffect(() => {
    setActiveChangeId(proposal.changes[0]?.id)
    setRegenerationFeedback('')
    setRegenerationOpen(false)
  }, [proposal.id, proposal.changes])

  useEffect(() => {
    focusTrapRef.current?.focus()
  }, [proposal.id])

  const activeChange = useMemo(
    () => proposal.changes.find(change => change.id === activeChangeId) ?? proposal.changes[0],
    [activeChangeId, proposal.changes],
  )
  const reviewedCount = proposal.changes.filter(change => change.decision).length
  const allReviewed = reviewedCount === proposal.changes.length && proposal.changes.length > 0
  const acceptedCount = proposal.changes.filter(change => change.decision === 'accepted').length
  const rejectedCount = proposal.changes.filter(change => change.decision === 'rejected').length
  const remainingCount = proposal.changes.length - reviewedCount
  const canMerge = allReviewed && acceptedCount > 0 && proposal.status !== 'applied' && proposal.status !== 'rejected' && proposal.status !== 'expired'
  const actionInProgress = merging || rejecting || regenerating || Boolean(decidingChangeId)
  const displayError = friendlyErrorText(error)
  const teamLabel = teamName ?? '当前团队'
  const progressPercent = proposal.changes.length > 0 ? Math.round((reviewedCount / proposal.changes.length) * 100) : 0
  const activeChangeIndex = activeChange ? proposal.changes.findIndex(change => change.id === activeChange.id) : -1
  const beforeSummary = activeChange ? changeSummary(activeChange, 'before') : { title: '当前', detail: '' }
  const afterSummary = activeChange ? changeSummary(activeChange, 'after') : { title: '升级后', detail: '' }
  const impactItems = activeChange?.impact
    .split(/[，,；;]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3) ?? []

  useEffect(() => {
    if (!activeChange?.decision) return
    const nextPendingChangeId = selectNextPendingChangeId(proposal.changes, activeChange.id)
    if (nextPendingChangeId) setActiveChangeId(nextPendingChangeId)
  }, [activeChange?.decision, activeChange?.id, proposal.changes])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const root = focusTrapRef.current
    if (!root) return
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(element => !element.hasAttribute('disabled') && element.offsetParent !== null)

    if (focusable.length === 0) {
      event.preventDefault()
      root.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handlePreviousChange() {
    if (!proposal.changes.length) return
    const currentIndex = activeChangeIndex >= 0 ? activeChangeIndex : 0
    const previousIndex = (currentIndex - 1 + proposal.changes.length) % proposal.changes.length
    setActiveChangeId(proposal.changes[previousIndex].id)
  }

  function handleNextChange() {
    if (!proposal.changes.length) return
    const currentIndex = activeChangeIndex >= 0 ? activeChangeIndex : 0
    const nextIndex = (currentIndex + 1) % proposal.changes.length
    setActiveChangeId(proposal.changes[nextIndex].id)
  }

  async function handleCurrentDecision(decision: EvolutionChangeDecision) {
    if (!activeChange) return
    await onDecide(activeChange.id, decision)
  }

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="evolution-review-title"
      data-testid="evolution-review-modal"
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
      className="fixed inset-0 layer-modal flex items-start justify-center overflow-auto bg-[color:var(--overlay-scrim)] px-4 py-[48px] text-ink"
    >
      <div className="flex max-h-[860px] w-full max-w-[1180px] flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_30px_80px_-10px_rgba(20,15,8,0.4)]">
        <header className="flex shrink-0 items-start justify-between gap-4 px-8 pb-4 pt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="evolution-review-title" className="font-display text-[28px] font-semibold leading-tight text-ink">升级确认</h2>
              <span className="rounded-full bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent">{teamLabel}</span>
            </div>
            <p className="mt-2 text-[14px] leading-6 text-ink-soft">逐张审阅建议卡片，全部处理后再确认升级。</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => { void onReject() }}
              disabled={actionInProgress}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-muted hover:text-[color:var(--danger)] disabled:cursor-wait disabled:opacity-60"
            >
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              放弃本次升级
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              aria-label="关闭改进建议"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div data-testid="evolution-review-progress" className="shrink-0 px-8 pb-5">
          <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
            <span className="font-mono text-[13px] text-ink-soft">
              已处理 <b className="text-accent">{reviewedCount}</b> / {proposal.changes.length}
            </span>
            <span className="rounded-lg border border-line bg-surface px-8 py-3 text-center text-[13px] font-semibold text-ink-soft">
              已采纳 <b className="text-[color:var(--success)]">{acceptedCount}</b>
              <span className="mx-4 text-line">|</span>
              不采纳 <b>{rejectedCount}</b>
              <span className="mx-4 text-line">|</span>
              待处理 <b className="text-accent">{remainingCount}</b>
            </span>
            <div className="flex items-center justify-end gap-4">
              <button type="button" onClick={handlePreviousChange} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted" aria-label="上一张建议卡片">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="font-mono text-[14px] text-ink">建议 {activeChangeIndex + 1} / {proposal.changes.length}</span>
              <button type="button" onClick={handleNextChange} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted" aria-label="下一张建议卡片">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <main data-testid="evolution-review-deck" className="min-h-0 flex-1 overflow-auto px-8 pb-5">
          <div className="relative mx-auto max-w-[1040px]">
            <div className="pointer-events-none absolute inset-x-4 top-5 h-full rounded-xl border border-line bg-surface shadow-sm" aria-hidden />
            <div className="pointer-events-none absolute inset-x-2 top-3 h-full rounded-xl border border-line bg-surface shadow-sm" aria-hidden />
            {activeChange && (
              <article data-testid="evolution-current-card" className="relative rounded-xl border border-line bg-surface px-6 py-6 shadow-[0_16px_50px_-24px_rgba(20,15,8,0.45)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-[18px] font-bold text-on-accent">
                    {activeChangeIndex + 1}
                  </span>
                  <span className="text-[15px] font-semibold text-ink">{cardChangeKindLabel(activeChange)}</span>
                  <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-[12px] font-semibold text-ink-soft">{decisionText(activeChange.decision)}</span>
                </div>
                <h3 className="mt-5 text-[26px] font-semibold leading-tight text-ink">{activeChange.title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-ink-soft">{activeChange.why}</p>

                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-[13px] font-semibold text-ink-soft">影响点</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-[14px] text-ink-soft">
                    {(impactItems.length ? impactItems : [activeChange.impact]).map(item => (
                      <span key={item} className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] lg:items-center">
                  <section className="min-h-[86px] rounded-lg border border-line bg-surface-muted/55 p-4">
                    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-6 text-ink">{beforeSummary.title}</p>
                        <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-ink-soft">{beforeSummary.detail}</p>
                      </div>
                    </div>
                  </section>

                  <div className="hidden h-11 w-11 items-center justify-center rounded-full text-ink-soft lg:flex" aria-hidden="true">
                    <ChevronRight className="h-7 w-7" />
                  </div>

                  <section className="min-h-[86px] rounded-lg border border-line bg-accent/5 p-4">
                    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                        <UserRound className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-6 text-ink">{afterSummary.title}</p>
                        <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-ink-soft">{afterSummary.detail}</p>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    data-testid="evolution-reject-current"
                    onClick={() => { void handleCurrentDecision('rejected') }}
                    disabled={actionInProgress || activeChange.decision === 'rejected'}
                    className="inline-flex min-h-11 min-w-[140px] items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:cursor-wait disabled:opacity-55"
                  >
                    {decidingChangeId === activeChange.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    不采纳
                  </button>
                  <button
                    type="button"
                    data-testid="evolution-accept-current"
                    onClick={() => { void handleCurrentDecision('accepted') }}
                    disabled={actionInProgress || activeChange.decision === 'accepted'}
                    className="inline-flex min-h-11 min-w-[180px] items-center justify-center gap-2 rounded-lg bg-accent px-6 text-[15px] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-wait disabled:opacity-60"
                  >
                    {decidingChangeId === activeChange.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {activeChange.decision === 'accepted' ? '已采纳' : '采纳这张卡片'}
                  </button>
                </div>
              </article>
            )}
          </div>

          <p className="mt-5 text-center text-[13px] leading-6 text-ink-soft">用左右箭头切换建议卡片，也可以先保存稍后继续。</p>

          {regenerationOpen ? (
            <div className="mx-auto mt-4 max-w-xl rounded-lg border border-line bg-surface-muted p-3">
              <label className="text-[12px] font-semibold text-ink-soft" htmlFor="team-evolution-regeneration-feedback">补充意见后重新生成</label>
              <textarea
                id="team-evolution-regeneration-feedback"
                value={regenerationFeedback}
                onChange={event => setRegenerationFeedback(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-5 text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
                placeholder="例如：构建工程师还要负责 CI/CD 和制品管理。"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setRegenerationOpen(false)} className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-soft hover:bg-surface">取消</button>
                <button
                  type="button"
                  onClick={() => { void onRegenerate(regenerationFeedback) }}
                  disabled={actionInProgress || !regenerationFeedback.trim()}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-soft hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  重新生成
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => setRegenerationOpen(true)} disabled={actionInProgress} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-[12px] font-semibold text-ink-soft hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCcw className="h-4 w-4" />
                重新生成一版
              </button>
            </div>
          )}
        </main>

        <footer className="grid shrink-0 gap-4 border-t border-line bg-surface-muted px-8 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink" aria-live="polite">
              <Info className="h-4 w-4 shrink-0" />
              {allReviewed
                ? acceptedCount > 0
                  ? <>已处理全部卡片，采纳 {acceptedCount} 张，可以确认升级。</>
                  : <>已处理全部卡片，但没有采纳任何内容。请采纳至少一张，或放弃本次升级。</>
                : <>还有 {remainingCount} 张卡片待处理，暂不能确认升级。</>}
            </p>
            {displayError && <p className="mt-1 text-[12px] leading-5 text-[color:var(--danger)]" aria-live="polite">{displayError}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-muted"
            >
              保存并稍后处理
            </button>
            <button
              type="button"
              data-testid="evolution-confirm-upgrade"
              onClick={() => { void onMerge() }}
              disabled={!canMerge || actionInProgress}
              className="inline-flex min-h-11 min-w-[170px] items-center justify-center gap-2 rounded-lg bg-accent px-6 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-muted"
            >
              {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              确认升级
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
