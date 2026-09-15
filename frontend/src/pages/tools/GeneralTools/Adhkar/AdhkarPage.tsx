import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Card,
  Input,
  Button,
  ProgressBar,
  Badge,
  EmptyState,
} from '@/components/UI';
import { AdhkarCard } from '@/pages/tools/GeneralTools/Adhkar/AdhkarCard';
import { CategoryCard } from '@/pages/tools/GeneralTools/Adhkar/CategoryCard';
import { AddDhikrModal, type EditedDhikr } from '@/pages/tools/GeneralTools/Adhkar/AddDhikrModal';
import { DeleteDhikrModal } from '@/pages/tools/GeneralTools/Adhkar/DeleteDhikrModal';
import { useAdhkarStore } from '@/pages/tools/GeneralTools/Adhkar/useAdhkarStore';
import {
  useAdhkarApprovedStore,
  getApprovedAdhkarForCategory,
  applyOfficialMutations,
} from '@/pages/tools/GeneralTools/Adhkar/useAdhkarApprovedStore';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { isAdminRole } from '@/pages/auth/roles';
import { useAppStore } from '@/store/useAppStore';
import {
  deleteDhikrSubmission,
  deleteOfficialDhikr,
} from '@/pages/tools/GeneralTools/Adhkar/adhkarApi';
import { isNetworkError } from '@/services/apiError';
import { useDayPeriod } from '@/hooks/useDayPeriod';
import {
  CATEGORIES,
  CATEGORY_META,
  getAdhkarByCategory,
  getCategoryProgress,
  filterAdhkarByPeriod,
  getAdhkarHeroText,
  searchAdhkar,
  type Dhikr,
  type DhikrCategory,
  type AdhkarPeriod,
} from '@/pages/tools/GeneralTools/Adhkar/adhkar';
import {
  Search,
  ChevronRight,
  Info,
  CircleCheck,
  RotateCcw,
  BookmarkPlus,
} from 'lucide-react';

// =============================================================================
// Admin actions (edit/delete) shared by the overview and category views
// =============================================================================

function useDhikrAdminActions() {
  const user = useAuthStore((s) => s.user);
  const addNotification = useAppStore((s) => s.addNotification);
  const reloadApproved = useAdhkarApprovedStore((s) => s.load);
  const [editing, setEditing] = useState<EditedDhikr | null>(null);
  const [deleting, setDeleting] = useState<Dhikr | null>(null);
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  const canManage = isAdminRole(user?.role);

  const toEdited = (dhikr: Dhikr): EditedDhikr => {
    const isApproved = dhikr.id.startsWith('sub-');
    return {
      kind: isApproved ? 'approved' : 'official',
      id: isApproved ? dhikr.id.slice('sub-'.length) : dhikr.id,
      category: dhikr.category,
      title: dhikr.title ?? '',
      text: dhikr.text,
      source: dhikr.source,
    };
  };

  const startEdit = (dhikr: Dhikr) => {
    if (!canManage) return;
    setEditing(toEdited(dhikr));
  };

  const startDelete = (dhikr: Dhikr) => {
    if (!canManage) return;
    setDeleting(dhikr);
  };

  const cancelEdit = () => setEditing(null);

  const cancelDelete = () => {
    if (deletingInFlight) return;
    setDeleting(null);
  };

  const confirmDelete = async () => {
    if (!deleting || deletingInFlight) return;
    setDeletingInFlight(true);
    try {
      if (deleting.id.startsWith('sub-')) {
        await deleteDhikrSubmission(deleting.id.slice('sub-'.length));
      } else {
        await deleteOfficialDhikr(deleting.id);
      }
      // Approved content and official mutations may have changed; refresh.
      void reloadApproved();
      addNotification('تم حذف الذكر نهائياً', 'success', 4000);
      setDeleting(null);
    } catch (err) {
      if (isNetworkError(err)) {
        addNotification('تعذر حذف الذكر، تحقق من اتصالك بالإنترنت', 'error', 4000);
      } else {
        addNotification(
          err instanceof Error ? err.message : 'حدث خطأ غير متوقع',
          'error',
          4000,
        );
      }
    } finally {
      setDeletingInFlight(false);
    }
  };

  return {
    canManage,
    editing,
    deleting,
    deletingInFlight,
    startEdit,
    startDelete,
    cancelEdit,
    cancelDelete,
    confirmDelete,
  };
}

export default function AdhkarPage() {
  const currentCategory = useAdhkarStore((s) => s.currentCategory);
  const setCategory = useAdhkarStore((s) => s.setCategory);
  const admin = useDhikrAdminActions();
  const period = useDayPeriod();

  // Pull approved content + official mutations once on mount so the overview
  // reflects admin edits/deletions too. Idempotent and never throws.
  useEffect(() => {
    void useAdhkarApprovedStore.getState().load();
  }, []);

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {currentCategory ? (
          <motion.div
            key="category"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25 }}
          >
            <CategoryView
              category={currentCategory}
              onBack={() => setCategory(null)}
              canManage={admin.canManage}
              onEdit={admin.startEdit}
              onDelete={admin.startDelete}
              period={period}
            />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Overview
              onSelect={setCategory}
              canManage={admin.canManage}
              onEdit={admin.startEdit}
              onDelete={admin.startDelete}
              period={period}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin edit/delete dialogs (only ever shown for admins). */}
      <AddDhikrModal
        open={admin.editing !== null}
        onClose={admin.cancelEdit}
        categoryId={admin.editing?.category ?? CATEGORIES[0]}
        categoryTitle={
          admin.editing ? CATEGORY_META[admin.editing.category].title : ''
        }
        editing={admin.editing}
      />
      <DeleteDhikrModal
        open={admin.deleting !== null}
        dhikr={admin.deleting}
        deleting={admin.deletingInFlight}
        onConfirm={admin.confirmDelete}
        onClose={admin.cancelDelete}
      />
    </div>
  );
}

// =============================================================================
// Overview
// =============================================================================

function Overview({
  onSelect,
  canManage,
  onEdit,
  onDelete,
  period,
}: {
  onSelect: (c: DhikrCategory) => void;
  canManage: boolean;
  onEdit: (dhikr: Dhikr) => void;
  onDelete: (dhikr: Dhikr) => void;
  period: AdhkarPeriod;
}) {
  const counts = useAdhkarStore((s) => s.counts);
  const increment = useAdhkarStore((s) => s.increment);
  const reset = useAdhkarStore((s) => s.reset);
  const officialEdits = useAdhkarApprovedStore((s) => s.officialEdits);
  const officialDeletions = useAdhkarApprovedStore((s) => s.officialDeletions);
  const [query, setQuery] = useState('');

  const allResults = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const items = applyOfficialMutations(
      filterAdhkarByPeriod(
        CATEGORIES.flatMap((c) => getAdhkarByCategory(c)),
        period,
      ),
      officialEdits,
      officialDeletions,
    );
    return searchAdhkar(q, items);
  }, [query, officialEdits, officialDeletions, period]);

  const groupedResults = useMemo(() => {
    if (!allResults || allResults.length === 0) return [];
    return CATEGORIES.map((category) => ({
      category,
      items: allResults.filter((d) => d.category === category),
    })).filter((g) => g.items.length > 0);
  }, [allResults]);

  return (
    <div className="space-y-5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث في الأذكار: نص، عنوان، أو مصدر..."
        icon={<Search className="w-4 h-4" />}
        aria-label="البحث في الأذكار"
      />

      {groupedResults.length > 0 ? (
        <div className="space-y-6">
          {groupedResults.map(({ category, items }) => {
            const meta = CATEGORY_META[category];
            return (
              <section key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <meta.icon className="w-4 h-4 text-primary-500 dark:text-primary-400" />
                  <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {meta.title}
                  </h2>
                  <Badge variant="secondary" size="sm">
                    {items.length}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => onSelect(category)}
                    className="ms-auto text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 transition-colors"
                  >
                    عرض القسم
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((dhikr) => (
                    <AdhkarCard
                      key={dhikr.id}
                      dhikr={dhikr}
                      count={counts[dhikr.id] ?? 0}
                      onIncrement={() => increment(dhikr.id, dhikr.repeatCount)}
                      onReset={() => reset(dhikr.id)}
                      canManage={canManage}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : allResults ? (
        <EmptyState
          icon={<Search className="w-9 h-9" />}
          title="لا توجد نتائج"
          description="جرّب البحث بكلمات مختلفة"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category];
            const { completed, total } = getCategoryProgress(
              category,
              counts,
              filterAdhkarByPeriod(getAdhkarByCategory(category), period),
            );
            return (
              <CategoryCard
                key={category}
                meta={meta}
                completed={completed}
                total={total}
                onSelect={() => onSelect(category)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Category view
// =============================================================================

function CategoryView({
  category,
  onBack,
  canManage,
  onEdit,
  onDelete,
  period,
}: {
  category: DhikrCategory;
  onBack: () => void;
  canManage: boolean;
  onEdit: (dhikr: Dhikr) => void;
  onDelete: (dhikr: Dhikr) => void;
  period: AdhkarPeriod;
}) {
  const meta = CATEGORY_META[category];
  const counts = useAdhkarStore((s) => s.counts);
  const increment = useAdhkarStore((s) => s.increment);
  const reset = useAdhkarStore((s) => s.reset);
  const resetCategory = useAdhkarStore((s) => s.resetCategory);
  const approvedCategory = useAdhkarApprovedStore((s) => s.approved);
  const officialEdits = useAdhkarApprovedStore((s) => s.officialEdits);
  const officialDeletions = useAdhkarApprovedStore((s) => s.officialDeletions);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Pull approved user-submitted content for this category so the dhikr list
  // merge below has data. Load is idempotent, never throws and only updates
  // the store when the fetched list actually changed — on a network failure the
  // bundled offline adhkar simply render without additions.
  useEffect(() => {
    void useAdhkarApprovedStore.getState().load();
  }, [category]);

  // Official (offline) items first — with admin edits/deletions applied — then
  // APPROVED user submissions appended at the end of the category. Official
  // content and hardcoded order stay intact except for admin overrides.
  const categoryDhikrs = useMemo(
    () => [
      ...applyOfficialMutations(
        filterAdhkarByPeriod(getAdhkarByCategory(category), period),
        officialEdits,
        officialDeletions,
      ),
      ...getApprovedAdhkarForCategory(category, approvedCategory),
    ],
    [category, approvedCategory, officialEdits, officialDeletions, period],
  );
  // Progress is computed over the VISIBLE list, so a dhikr deleted by an admin
  // no longer counts towards the total.
  const { completed, total } = getCategoryProgress(
    category,
    counts,
    categoryDhikrs,
  );
  const allDone = total > 0 && completed === total;

  const Icon = meta.icon;

  // The morning-evening section header follows the active day period so it
  // shows only the relevant half of the day. Every other category is untouched.
  const periodHero =
    category === 'morning-evening' ? getAdhkarHeroText(period) : null;
  const headerTitle  = periodHero?.title  ?? meta.title;
  const headerDesc   = periodHero?.description ?? meta.description;

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-gray-500 hover:text-primary-500 dark:text-gray-400 dark:hover:text-primary-400 transition-colors group"
      >
        <ChevronRight className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
        <span className="text-sm font-medium">العودة لقائمة الأذكار</span>
      </button>

      {/* Header */}
      <Card padding="md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                {headerTitle}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {headerDesc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="md"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={() => resetCategory(category)}
              aria-label="تصفير القسم"
              title="تصفير القسم"
            >{''}</Button>
            <Button
              variant="ghost"
              size="md"
              icon={<BookmarkPlus className="w-4 h-4" />}
              onClick={() => setAddModalOpen(true)}
              aria-label="إضافة ذكر"
              title="إضافة ذكر"
            >{''}</Button>
          </div>
        </div>
      </Card>

      {/* Disclaimer for contextual categories */}
      {meta.disclaimer && (
        <Card padding="sm" className="border-amber-200 dark:border-amber-800/50">
          <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="leading-relaxed">{meta.disclaimer}</p>
          </div>
        </Card>
      )}

      {/* Progress */}
     
     
      

      <div className="space-y-3">
        {categoryDhikrs.map((dhikr: Dhikr) => (
          <AdhkarCard
            key={dhikr.id}
            dhikr={dhikr}
            count={counts[dhikr.id] ?? 0}
            onIncrement={() => increment(dhikr.id, dhikr.repeatCount)}
            onReset={() => reset(dhikr.id)}
            canManage={canManage}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <AddDhikrModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        categoryId={category}
        categoryTitle={meta.title}
      />
    </div>
  );
}