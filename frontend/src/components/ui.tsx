import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { Loader2, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { congestionBg, titleCase, formatNumber } from '../lib/format'
import { cx } from '../lib/cx'
import type { CongestionLevel } from '../types'

export function Panel({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}) {
  return <Tag className={cx('panel', className)}>{children}</Tag>
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="label mb-2">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-100">{title}</h2>
        {subtitle && <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'default' | 'signal' | 'amber' | 'coral' | 'blue' | 'violet'

const toneClass: Record<Tone, string> = {
  default: 'border-white/[0.1] bg-white/[0.04] text-ink-300',
  signal: 'border-signal-500/25 bg-signal-500/10 text-signal-400',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  coral: 'border-coral-500/25 bg-coral-500/10 text-coral-400',
  blue: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  violet: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
}

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return <span className={cx('chip', toneClass[tone], className)}>{children}</span>
}

export function CongestionPill({ level, score }: { level: CongestionLevel; score?: number }) {
  return (
    <span className={cx('chip', congestionBg[level])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(level)}
      {score !== undefined && <span className="mono opacity-70">{formatNumber(score, 0)}</span>}
    </span>
  )
}

export function StatCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = 'default',
  trend,
  className,
}: {
  label: string
  value: string
  suffix?: string
  hint?: string
  icon: ComponentType<LucideProps>
  tone?: Tone
  trend?: { direction: 'up' | 'down' | 'flat'; text: string; good?: boolean }
  className?: string
}) {
  const iconTone: Record<Tone, string> = {
    default: 'border-white/[0.09] bg-white/[0.04] text-ink-300',
    signal: 'border-signal-500/20 bg-signal-500/10 text-signal-400',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    coral: 'border-coral-500/20 bg-coral-500/10 text-coral-400',
    blue: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
    violet: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
  }
  const TrendIcon = trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : Minus
  return (
    <div className={cx('panel panel-hover p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="label">{label}</span>
        <span className={cx('grid h-8 w-8 place-items-center rounded-lg border', iconTone[tone])}>
          <Icon size={15} strokeWidth={1.7} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {suffix && <span className="ml-1.5 text-xs font-medium tracking-normal text-ink-400">{suffix}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {hint ? <span className="text-[10px] text-ink-500">{hint}</span> : <span />}
        {trend && (
          <span
            className={cx(
              'mono inline-flex items-center gap-1 text-[10px]',
              trend.good === false ? 'text-coral-400' : trend.good ? 'text-signal-400' : 'text-ink-400',
            )}
          >
            <TrendIcon size={11} />
            {trend.text}
          </span>
        )}
      </div>
    </div>
  )
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx('animate-spin', className)} />
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<LucideProps>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-ink-400">
        <Icon size={19} strokeWidth={1.6} />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink-200">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label className={cx('flex cursor-pointer items-center justify-between gap-4 py-2.5', disabled && 'opacity-50')}>
      <span>
        <span className="block text-xs font-medium text-ink-200">{label}</span>
        {description && <span className="mt-0.5 block text-[10px] leading-relaxed text-ink-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-signal-500/50 bg-signal-500/30' : 'border-white/[0.12] bg-white/[0.05]',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-ink-100 transition-all',
            checked ? 'left-[18px] bg-signal-400' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="label mb-1.5 flex items-center justify-between gap-2">
        <span>{label}</span>
        {hint && <span className="normal-case tracking-normal text-ink-500">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-ink-300">
      <span
        className={cx('inline-block h-0.5 w-4 rounded-full', dashed && 'opacity-80')}
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      {label}
    </span>
  )
}

export function MiniBar({ value, color = '#43e0b0', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-1 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

export function KeyValue({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] py-2 last:border-0">
      <span className="text-[11px] text-ink-400">{label}</span>
      <span className={cx('text-right text-[11px] font-medium text-ink-200', mono && 'mono')}>{value}</span>
    </div>
  )
}
