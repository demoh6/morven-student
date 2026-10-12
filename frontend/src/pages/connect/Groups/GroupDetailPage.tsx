import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { Input, TextArea } from '@/components/UI/Input';
import { Modal } from '@/components/UI/Modal';
import {
  getGroupDetails,
  leaveGroup,
  deleteGroup,
  removeMember,
  updateGroup,
  getWeeklyGroupRanking,
  type GroupDetails,
  type WeeklyRankingEntry,
} from '@/services/groupApi';
import { cacheGet, cacheSet } from '@/services/offlineCache';
import { isNetworkFailure, userFacingMessage, OFFLINE_GROUP_DETAIL_MESSAGE } from '@/services/apiError';
import {
  connectSocket,
  joinGroup,
  leaveGroup as leaveGroupPresence,
  onPresence,
  onLeaderboard,
  onFocusing,
  type PresenceUser,
} from '@/services/socketService';
import { GroupMemberRow } from '@/pages/connect/Groups/GroupMemberRow';
import { CachedImage } from '@/components/UI/CachedImage';
import { setActiveGroupId } from '@/pages/tools/GeneralTools/Pomodoro/connectPomodoro';
import { usePomodoroStore } from '@/pages/tools/GeneralTools/Pomodoro/usePomodoroStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { isAdminRole } from '@/pages/auth/roles';
import { API_BASE } from '@/services/apiBase';
import {
  Users,
  Crown,
  ChevronLeft,
  Copy,
  Check,
  Pencil,
  ImagePlus,
  X,
  Play,
  Timer,
} from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

const groupDetailKey = (id: string) => `groups:detail:${id}`;
const groupWeeklyRankingKey = (id: string) => `groups:detail:${id}:weekly`;

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'leave' | 'delete' | null>(null);
  const [confirmMemberId, setConfirmMemberId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  // The active competition week's ranking (Saturday 00:00 → Friday 23:59:59,
  // Asia/Hebron). This is the only value used for the member list — it resets
  // automatically each Saturday because the backend scopes it to the current
  // week, so weekly group study hours visibly drop to zero with no reset job.
  const [weeklyRanking, setWeeklyRanking] = useState<WeeklyRankingEntry[]>([]);
  // userId -> currently focusing (online + Pomodoro running). Live and cross-group.
  const [focusingMap, setFocusingMap] = useState<Record<string, boolean>>({});

  const pomodoroRunning = usePomodoroStore((s) => s.isRunning);
  const pomodoroMode = usePomodoroStore((s) => s.mode);

  // Edit group state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editImageRef = useRef<HTMLInputElement>(null);

  // Fetch group details
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    (async () => {
      try {
        const { group: g } = await getGroupDetails(groupId);
        if (!cancelled) setGroup(g);
        void cacheSet(groupDetailKey(groupId), g);
      } catch (err) {
        // Offline / unreachable — serve the last cached detail for this group.
        const cached = await cacheGet<GroupDetails>(groupDetailKey(groupId), { allowStale: true });
        if (!cancelled) {
          if (cached) setGroup(cached.value);
          else setError(
            isNetworkFailure(err) ? OFFLINE_GROUP_DETAIL_MESSAGE : userFacingMessage(err, 'حدث خطأ'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  // Fetch the current competition week's ranking. This drives both the member
  // list order and the displayed "weekly group study hours" badge.
  const loadWeeklyRanking = useCallback(async (id: string) => {
    try {
      const { ranking } = await getWeeklyGroupRanking(id);
      setWeeklyRanking(ranking);
      void cacheSet(groupWeeklyRankingKey(id), ranking);
    } catch {
      // Offline / unreachable — fall back to the last cached weekly ranking so
      // members stay ranked by their last-known weekly study time.
      const cached = await cacheGet<WeeklyRankingEntry[]>(groupWeeklyRankingKey(id), {
        allowStale: true,
      });
      if (cached) setWeeklyRanking(cached.value);
    }
  }, []);

  useEffect(() => {
    if (!groupId) return;
    void loadWeeklyRanking(groupId);
  }, [groupId, loadWeeklyRanking]);

  // Socket.IO group presence + leaderboard
  useEffect(() => {
    if (!groupId) return;
    try {
      connectSocket();
      onPresence((users) => {
        setPresenceUsers(users);
        // Merge focusing flags carried by the presence snapshot.
        setFocusingMap((prev) => {
          const next = { ...prev };
          for (const u of users) next[u.userId] = u.focusing;
          return next;
        });
      });
      onLeaderboard((data) => {
        if (data.groupId === groupId) {
          // The Socket.IO broadcast carries the all-time board; the weekly
          // ranking changes on the same session-submit events, so refresh it
          // through the existing live signal instead of adding a socket event.
          void loadWeeklyRanking(groupId);
        }
      });
      onFocusing((data) => {
        if (data.groupId === groupId) {
          setFocusingMap((prev) => ({ ...prev, [data.userId]: data.focusing }));
        }
      });
      // `joinGroup` throws when the socket cannot be established (e.g. offline
      // with no access token). Presence is an enhancement — the page must still
      // render cached group data when it is unavailable.
      joinGroup(groupId);
    } catch {
      /* Offline / not authenticated — realtime presence is unavailable. */
    }
    // Leave the room on unmount, but keep the socket connected so this user
    // stays online/present for the rest of the app session (required for the
    // Focusing indicator to remain valid in their groups).
    return () => {
      try {
        leaveGroupPresence(groupId);
      } catch {
        /* Socket already gone. */
      }
    };
  }, [groupId, loadWeeklyRanking]);

  // Track the active group for Pomodoro integration. The Connect sync itself is
  // started app-wide by PomodoroTimerService so focusing keeps propagating even
  // while the timer runs on another page.
  useEffect(() => {
    if (!groupId) return;
    setActiveGroupId(groupId);
    return () => setActiveGroupId(null);
  }, [groupId]);

  const openEdit = () => {
    if (!group) return;
    setEditName(group.name);
    setEditDesc(group.description || '');
    setEditImage(null);
    setEditImagePreview(group.imageUrl ? (group.imageUrl.startsWith('http') ? group.imageUrl : `${API_BASE}${group.imageUrl}`) : null);
    setEditRemoveImage(false);
    setShowEdit(true);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    setEditSaving(true);
    setError(null);
    try {
      await updateGroup(groupId, {
        name: editName,
        description: editDesc || undefined,
        image: editImage || undefined,
        removeImage: editRemoveImage,
      });
      const { group: g } = await getGroupDetails(groupId);
      setGroup(g);
      void cacheSet(groupDetailKey(groupId), g);
      setShowEdit(false);
    } catch (err) {
      setError(userFacingMessage(err, 'حدث خطأ'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!groupId) return;
    setActionLoading(true);
    try {
      await leaveGroup(groupId);
      navigate('/connect/groups');
    } catch (err) {
      setError(userFacingMessage(err, 'حدث خطأ'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    if (!groupId) return;
    setActionLoading(true);
    try {
      await deleteGroup(groupId);
      navigate('/connect/groups');
    } catch (err) {
      setError(userFacingMessage(err, 'حدث خطأ'));
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!groupId || !confirmMemberId) return;
    setActionLoading(true);
    try {
      await removeMember(groupId, confirmMemberId);
      const { group: g } = await getGroupDetails(groupId);
      setGroup(g);
      void cacheSet(groupDetailKey(groupId), g);
    } catch (err) {
      setError(userFacingMessage(err, 'حدث خطأ'));
    } finally {
      setActionLoading(false);
      setConfirmMemberId(null);
    }
  };

  const handleCopyCode = () => {
    if (group?.joinCode) {
      navigator.clipboard.writeText(group.joinCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleStartFocus = () => {
    navigate('/tool/pomodoro-timer');
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{error || 'المجموعة غير موجودة'}</h2>
        <Link to="/connect/groups">
          <Button variant="secondary" className="mt-4">العودة للمجموعات</Button>
        </Link>
      </div>
    );
  }

  const isOwner = group.role === 'OWNER';
  const isAdmin = group.role === 'ADMIN';
  // A system ADMIN/SUB_ADMIN (User.role) manages every group without joining.
  const isGlobalAdmin = isAdminRole(user?.role);
  // OWNER and ADMIN can edit the group; only the OWNER or a system ADMIN may
  // delete it.
  const canEdit = isOwner || isAdmin;
  const canDelete = isGlobalAdmin || (isOwner && group.members.length === 1);
  // Leave is only meaningful when the user is actually a member.
  const canLeave = group.isMember !== false;
  const myId = user?.id;
  const groupImageUrl = group.imageUrl ? (group.imageUrl.startsWith('http') ? group.imageUrl : `${API_BASE}${group.imageUrl}`) : null;
  // Internal "online" set (used ONLY to determine whether Focusing is valid;
  // never rendered as a standalone indicator).
  const onlineIds = new Set(presenceUsers.map((p) => p.userId));
  const isFocusing = (memberId: string) => focusingMap[memberId] === true && onlineIds.has(memberId);

  // Build a map from userId to this week's study seconds for quick lookup.
  const weeklyMap = new Map<string, number>();
  for (const entry of weeklyRanking) {
    weeklyMap.set(entry.userId, entry.weeklySeconds);
  }

  // Sort members by the current week's ranking, which is already sorted
  // server-side by weekly study hours descending (ties broken by userId). So the
  // highest weekly-hours user is always first / Rank #1. Members not present in
  // the ranking (shouldn't happen but fallback) appear at the end.
  const weeklyRankOrder = weeklyRanking.map((e) => e.userId);
  const sortedMembers = [...group.members].sort((a, b) => {
    const ia = weeklyRankOrder.indexOf(a.id);
    const ib = weeklyRankOrder.indexOf(b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return 0;
  });

  const isFocusActive = pomodoroRunning && pomodoroMode === 'focus';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      {/* Back nav */}
      <motion.div {...fadeUp}>
        <Link
          to="/connect/groups"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">المجموعات</span>
        </Link>
      </motion.div>

      {/* Group header card */}
      <motion.div {...fadeUp}>
        <Card padding="lg" className="mb-6 relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-primary-100/40 dark:bg-primary-900/15 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-md flex items-center justify-center shrink-0 overflow-hidden">
                {groupImageUrl ? (
                  <CachedImage
                    src={groupImageUrl}
                    alt={group.name}
                    className="w-full h-full object-cover"
                    fallback={<Users className="w-7 h-7" />}
                  />
                ) : (
                  <Users className="w-7 h-7" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{group.name}</h1>
                  {isOwner && <Crown className="w-3.5 h-3.5 text-primary-400 dark:text-primary-500 shrink-0" />}
                </div>
                {group.description && (
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{group.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {group.members.length} طلاب
              </span>
            </div>

            {/* Join code (visible to all members) */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-dark-surface">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">رمز الانضمام</span>
                <span className="text-sm font-mono font-bold text-primary-600 dark:text-primary-400 tracking-wider" dir="ltr">
                  {group.joinCode}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                title="نسخ الرمز"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Start Focus button — only for actual members (focus time is
          membership-based) */}
      {canLeave && (
        <motion.div {...fadeUp}>
          <Card padding="lg" className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isFocusActive ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-primary-100 dark:bg-primary-900/30'}`}>
                  <Timer className={`w-5 h-5 ${isFocusActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary-600 dark:text-primary-400'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {isFocusActive ? 'جلسة تركيز نشطة' : 'ابدأ جلسة تركيز'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isFocusActive ? 'ستُحسب لهذه المجموعة' : 'ستُحسب لنقاط المجموعة'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={isFocusActive ? 'secondary' : 'primary'}
                onClick={handleStartFocus}
                icon={<Play className="w-4 h-4" />}
              >
                {isFocusActive ? 'الذهاب' : 'ابدأ'}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Members card — ranked by focus time */}
      <motion.div {...fadeUp}>
        <Card padding="lg" className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">الطلاب</h2>
          <div className="space-y-2">
            {sortedMembers.map((m, index) => {
              // An ADMIN can remove any other member — including the OWNER and
              // other ADMINS — but never themselves. (Matches backend rule.)
              const canRemove = isAdmin && m.id !== myId;
              const totalSeconds = weeklyMap.get(m.id) ?? 0;
              return (
                <GroupMemberRow
                  key={m.id}
                  member={m}
                  rank={index + 1}
                  totalSeconds={totalSeconds}
                  focusing={isFocusing(m.id)}
                  isSelf={m.id === myId}
                  canRemove={canRemove}
                  onRemove={canRemove ? () => setConfirmMemberId(m.id) : undefined}
                />
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Actions */}
      <motion.div {...fadeUp} className="flex flex-wrap gap-3">
        {canEdit && (
          <Button variant="secondary" onClick={openEdit} icon={<Pencil className="w-4 h-4" />}>
            تعديل المجموعة
          </Button>
        )}
        {canLeave && (
          <Button variant="danger" loading={actionLoading} onClick={() => setConfirmAction('leave')}>
            مغادرة المجموعة
          </Button>
        )}
        {/* OWNER (alone) or a system ADMIN can delete the group. */}
        {canDelete && (
          <Button variant="danger" loading={actionLoading} onClick={() => setConfirmAction('delete')}>
            حذف المجموعة
          </Button>
        )}
      </motion.div>

      {/* Edit Group Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="تعديل المجموعة" size="lg">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <input ref={editImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 2 * 1024 * 1024) { setError('حجم الصورة يجب أن يكون أقل من 2 ميجا'); return; }
                setEditImage(file);
                setEditRemoveImage(false);
                const reader = new FileReader();
                reader.onload = (ev) => setEditImagePreview(ev.target?.result as string);
                reader.readAsDataURL(file);
              }
            }} />
            {editImagePreview ? (
              <div className="relative w-20 h-20">
                <img src={editImagePreview} alt="معاينة" className="w-20 h-20 rounded-2xl object-cover border border-light-border dark:border-dark-border" />
                <button type="button" onClick={() => { setEditImage(null); setEditImagePreview(null); setEditRemoveImage(true); if (editImageRef.current) editImageRef.current.value = ''; }} className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => editImageRef.current?.click()} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-dark-border hover:border-primary-400 dark:hover:border-primary-500 transition-colors text-gray-400 dark:text-gray-500 hover:text-primary-500">
                <ImagePlus className="w-5 h-5" />
                <span className="text-sm">إضافة صورة المجموعة</span>
              </button>
            )}
          </div>
          <Input label="اسم المجموعة" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          <TextArea label="الوصف" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} maxLength={500} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowEdit(false)} className="flex-1">إلغاء</Button>
            <Button type="submit" loading={editSaving} className="flex-1">حفظ التعديلات</Button>
          </div>
        </form>
      </Modal>

      {/* Leave confirmation */}
      <Modal open={confirmAction === 'leave'} onClose={() => setConfirmAction(null)} title="مغادرة المجموعة" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          هل أنت متأكد من مغادرة هذه المجموعة؟ لن تتمكن من الانضمام مرة أخرى إلا برمز جديد.
        </p>
        {isOwner && group.members.length > 1 && (
          <p className="text-xs text-primary-500 dark:text-primary-400 mb-6">
            بوصفك المالك، ستنتقل الملكية تلقائياً إلى أول عضو انضم.
          </p>
        )}
        {isOwner && group.members.length === 1 && (
          <p className="text-xs text-primary-500 dark:text-primary-400 mb-6">
            أنت العضو الوحيد، لذا سيتم حذف المجموعة عند مغادرتها.
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmAction(null)} className="flex-1">إلغاء</Button>
          <Button variant="danger" loading={actionLoading} onClick={handleLeave} className="flex-1">مغادرة</Button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={confirmAction === 'delete'} onClose={() => setConfirmAction(null)} title="حذف المجموعة" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          هل أنت متأكد من حذف هذه المجموعة؟ سيتم حذف جميع الطلاب نهائياً.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmAction(null)} className="flex-1">إلغاء</Button>
          <Button variant="danger" loading={actionLoading} onClick={handleDelete} className="flex-1">حذف</Button>
        </div>
      </Modal>

      {/* Remove member confirmation */}
      <Modal open={confirmMemberId !== null} onClose={() => setConfirmMemberId(null)} title="إزالة العضو" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          هل أنت متأكد من إزالة هذا العضو من المجموعة؟
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmMemberId(null)} className="flex-1">إلغاء</Button>
          <Button variant="danger" loading={actionLoading} onClick={handleRemoveMember} className="flex-1">إزالة</Button>
        </div>
      </Modal>
    </div>
  );
}
