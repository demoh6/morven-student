import { Link } from 'react-router-dom';
import {
  Users,
  Crown,
  ChevronLeft,
  Copy,
  Check,
  Pencil,
  LogOut,
  Trash2,
  Trophy,
  UserMinus,
} from 'lucide-react';
import { Avatar } from '@/pages/connect/Avatar';
import { CachedImage } from '@/components/UI/CachedImage';
import { formatFocusDuration } from '@/pages/connect/Groups/GroupMemberRow';
import type { GroupDetails, GroupMember } from '@/services/groupApi';

type FocusTotals = { weekly: number; daily: number };

export type GroupDetailMobileProps = {
  group: GroupDetails;
  /** Members already sorted by the current week's ranking. */
  members: GroupMember[];
  /** userId -> this week's / today's study seconds (ranked members only). */
  focusMap: Map<string, FocusTotals>;
  /** userIds whose "جارٍ التركيز..." indicator is live right now. */
  focusingIds: Set<string>;
  myId?: string;
  isOwner: boolean;
  /** Group ADMIN (can remove other members). */
  isGroupAdmin: boolean;
  canEdit: boolean;
  canLeave: boolean;
  canDelete: boolean;
  copiedCode: boolean;
  onCopyCode: () => void;
  onEdit: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onRemoveMember: (id: string) => void;
};

const TOP_RANK_COLORS = {
  1: 'text-amber-500 dark:text-amber-400',
  2: 'text-slate-400 dark:text-slate-300',
  3: 'text-orange-600 dark:text-orange-400',
} as const;

const TOP_RANK_LABELS = {
  1: 'المركز الأول',
  2: 'المركز الثاني',
  3: 'المركز الثالث',
} as const;

/** Compact rank indicator mirroring the desktop visual language. */
function MobileRankBadge({ rank }: { rank: number }) {
  const color = TOP_RANK_COLORS[rank as 1 | 2 | 3];
  if (color) {
    return (
      <span
        aria-label={TOP_RANK_LABELS[rank as 1 | 2 | 3]}
        className={`w-5 flex items-center justify-center shrink-0 ${color}`}
      >
        <Trophy className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span
      aria-label={`الترتيب ${rank}`}
      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-gray-100 dark:bg-dark-surface border border-light-border dark:border-dark-border text-[10px] font-bold text-gray-500 dark:text-gray-400"
    >
      {rank}
    </span>
  );
}

const ACTION_TONES = {
  edit: 'active:text-primary-500 active:bg-primary-50 dark:active:bg-primary-900/20',
  leave: 'active:text-amber-600 active:bg-amber-50 dark:active:bg-amber-900/20',
  delete: 'active:text-red-500 active:bg-red-50 dark:active:bg-red-900/10',
} as const;

function HeaderActionButton({
  tone,
  label,
  onClick,
  children,
}: {
  tone: keyof typeof ACTION_TONES;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 transition-colors ${ACTION_TONES[tone]}`}
    >
      {children}
    </button>
  );
}

function MobileMemberRow({
  member,
  rank,
  weeklySeconds,
  dailySeconds,
  focusing,
  isSelf,
  canRemove,
  onRemove,
}: {
  member: GroupMember;
  rank: number;
  weeklySeconds: number;
  dailySeconds: number;
  focusing: boolean;
  isSelf: boolean;
  canRemove: boolean;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <MobileRankBadge rank={rank} />
      <Avatar src={member.avatarUrl} name={member.displayName} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link
            to={`/connect/profile/${member.username}`}
            className="text-[13.5px] font-semibold leading-snug text-gray-900 dark:text-white hover:text-primary-500 dark:hover:text-primary-400 transition-colors break-words min-w-0"
          >
            {member.displayName}
          </Link>
          {member.role === 'OWNER' && (
            <Crown className="w-3 h-3 text-primary-400 dark:text-primary-500 shrink-0" aria-label="المنشئ" />
          )}
          {isSelf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium shrink-0">
              أنت
            </span>
          )}
          {canRemove && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 active:text-red-500 active:bg-red-50 dark:active:bg-red-900/10 transition-colors shrink-0"
              title="إزالة العضو"
              aria-label="إزالة العضو"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          )}
        </div>

        {focusing && (
          <span className="block text-[11px] leading-tight text-red-600 dark:text-red-400 mt-0.5">
            جارٍ التركيز...
          </span>
        )}
      </div>

      {/* Weekly + daily study time — compact column pinned to the far left
          (renders on the left in RTL): "هذا الأسبوع" on top, "هذا اليوم" below. */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span
          title="ساعات التركيز هذا الأسبوع"
          className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-dark-surface px-1.5 py-0.5 text-[10.5px] leading-none font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
        >
          هذا الأسبوع:{' '}
          <span className="font-semibold text-red-600 dark:text-red-400">{formatFocusDuration(weeklySeconds)}</span>
        </span>
        <span
          title="ساعات التركيز هذا اليوم"
          className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-dark-surface px-1.5 py-0.5 text-[10.5px] leading-none font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
        >
          هذا اليوم:{' '}
          <span className="font-semibold text-red-600 dark:text-red-400">{formatFocusDuration(dailySeconds)}</span>
        </span>
      </div>
    </li>
  );
}

/**
 * Phone-only group page. Deliberately re-organized for narrow, one-handed use:
 * a flat, compact header (group identity on the right, management actions pinned
 * to the extreme left on the name line) and a card-free member list whose weekly
 * / today study-time statistics sit in a compact column on the far left of each
 * row, beside the name, avatar and focus indicator.
 *
 * Rendered only below 640px (see `useIsMobilePhone`); tablets and desktops keep
 * the original layout in `GroupDetailPage`.
 */
export function GroupDetailMobile({
  group,
  members,
  focusMap,
  focusingIds,
  myId,
  isOwner,
  isGroupAdmin,
  canEdit,
  canLeave,
  canDelete,
  copiedCode,
  onCopyCode,
  onEdit,
  onLeave,
  onDelete,
  onRemoveMember,
}: GroupDetailMobileProps) {
  return (
    <div className="-mx-4 px-3 pt-1 pb-10" dir="rtl">
      {/* Back nav */}
      <Link
        to="/connect/groups"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-500 dark:text-primary-400 active:opacity-70 transition-opacity"
      >
        <ChevronLeft className="w-4 h-4" />
        المجموعات
      </Link>

      {/* Group header */}
      <header className="mt-3">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
            {group.imageUrl ? (
              <CachedImage
                src={group.imageUrl}
                alt={group.name}
                className="w-full h-full object-cover"
                fallback={<Users className="w-5 h-5" />}
              />
            ) : (
              <Users className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="text-[17px] font-bold leading-snug text-gray-900 dark:text-white break-words min-w-0">
                {group.name}
              </h1>
              {isOwner && <Crown className="w-3.5 h-3.5 text-primary-400 dark:text-primary-500 shrink-0" />}
            </div>
            {group.description && (
              <p className="text-[12px] leading-snug text-gray-500 dark:text-gray-400 break-words mt-0.5">
                {group.description}
              </p>
            )}
          </div>

          {/* Management actions — extreme-left edge, on the name line. */}
          {(canEdit || canLeave || canDelete) && (
            <div className="flex items-center gap-0.5 shrink-0">
              {canEdit && (
                <HeaderActionButton tone="edit" label="تعديل المجموعة" onClick={onEdit}>
                  <Pencil className="w-4 h-4" />
                </HeaderActionButton>
              )}
              {canLeave && (
                <HeaderActionButton tone="leave" label="مغادرة المجموعة" onClick={onLeave}>
                  <LogOut className="w-4 h-4" />
                </HeaderActionButton>
              )}
              {canDelete && (
                <HeaderActionButton tone="delete" label="حذف المجموعة" onClick={onDelete}>
                  <Trash2 className="w-4 h-4" />
                </HeaderActionButton>
              )}
            </div>
          )}
        </div>

        {/* Meta: member count + join code (tap to copy) */}
        <div className="flex items-center flex-wrap gap-2 mt-2.5">
          <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-dark-surface px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300">
            <Users className="w-3.5 h-3.5" />
            {group.members.length} طلاب
          </span>

          <button
            type="button"
            onClick={onCopyCode}
            title="نسخ الرمز"
            aria-label="نسخ رمز الانضمام"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 px-2 py-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 active:opacity-70 transition-opacity min-w-0"
          >
            <span className="font-mono font-bold tracking-wider" dir="ltr">
              {group.joinCode}
            </span>
            {copiedCode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </header>

      {/* Section boundary: group information ↔ students section. A subtle
          primary-tinted rule (fading at both ends) that reads as a distinct
          section break while staying lightweight — no card or background. */}
      <div className="mt-4 h-0.5 rounded-full bg-gradient-to-l from-transparent via-primary-400/50 to-transparent dark:via-primary-500/40" />

      {/* Members */}
      <section className="mt-4">
        <h2 className="text-[18px] font-bold text-gray-900 dark:text-white mb-1 px-0.5">الطلاب</h2>

        {members.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-gray-400 dark:text-gray-500">لا يوجد طلاب بعد</p>
        ) : (
          <ul className="divide-y divide-light-border dark:divide-dark-border">
            {members.map((m, index) => {
              const totals = focusMap.get(m.id) ?? { weekly: 0, daily: 0 };
              const canRemove = isGroupAdmin && m.id !== myId;
              return (
                <MobileMemberRow
                  key={m.id}
                  member={m}
                  rank={index + 1}
                  weeklySeconds={totals.weekly}
                  dailySeconds={totals.daily}
                  focusing={focusingIds.has(m.id)}
                  isSelf={m.id === myId}
                  canRemove={canRemove}
                  onRemove={canRemove ? () => onRemoveMember(m.id) : undefined}
                />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
