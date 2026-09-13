import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/UI/EmptyState';
import { Modal } from '@/components/UI/Modal';
import { Input, TextArea, Select } from '@/components/UI/Input';
import { Button } from '@/components/UI/Button';
import { Tooltip } from '@/components/UI/Tooltip';
import { SearchBar } from '@/components/UI/SearchBar';
import { Chip } from '@/components/UI/Chip';
import { BookOpen, ChevronLeft, Plus, Info, SearchX, Lock, KeyRound } from 'lucide-react';
import {
  typeLabels,
  typeIcons,
  typeOptions,
  type ResourceType,
} from '@/pages/connect/Resources/resources';
import { useResourcesStore } from '@/pages/connect/Resources/useResourcesStore';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const infoPoints = [
  {
    title: 'ما هي الموارد؟',
    description: 'الموارد هي مواد تعليمية مشتركة يقدمها طلاب الملتقى مثل الملخصات والأسئلة والروابط المفيدة.',
  },
  {
    title: 'كيف أنشئ مورد؟',
    description: 'اضغط زر إنشاء (+) أعلى الصفحة، ثم أدخل اسم المادة ووصفها واختر تصنيفها ونوعها.',
  },
  {
    title: 'كيف أضيف مورداً بالكود؟',
    description: 'اضغط زر المفتاح (الانضمام بالكود) أعلى الصفحة، ثم أدخل رمز الوصول المكوّن من 6 أرقام ليظهر المورد الخاص في قائمتك.',
  },
  {
    title: 'الموارد العامة والخاصة',
    description: 'عند إنشاء مورد يمكنك اختيار ظهوره: عام يظهر للجميع، أو خاص لا يظهر إلا لمن يملك رمز الوصول. المالك يحصل على كود من 6 أرقام يشاركه مع من يريد، ويمكن للمستخدمين فتح المورد الخاص بالكود أو الانضمام إليه مباشرة.',
  },
  {
    title: 'كيف أستخدمها؟',
    description: 'ابحث عن الموارد بالاسم بكتابة كلمة في خانة البحث أعلى الصفحة، أو تصفح القائمة أدناه مباشرة.',
  },
  {
    title: 'قواعد أساسية',
    description: 'أضف فقط محتوى تعليمي مفيد، واختر التصنيف الصحيح، واحترم الجهود التعليمية للمشاركين الآخرين.',
  },
];

export default function ResourcesPage() {
  const resources = useResourcesStore((s) => s.resources);
  const loading = useResourcesStore((s) => s.loading);
  const fetchResources = useResourcesStore((s) => s.fetchResources);
  const createResource = useResourcesStore((s) => s.createResource);
  const addResourceByCode = useResourcesStore((s) => s.addResourceByCode);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showAddByCode, setShowAddByCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bindCode, setBindCode] = useState('');
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ResourceType>('file');
  const [isPrivate, setIsPrivate] = useState(false);
  const visibilityOptions = [
    { value: 'public', label: 'عام' },
    { value: 'private', label: 'خاص' },
  ];

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? resources.filter((r) => r.title.toLowerCase().includes(normalizedQuery))
    : resources;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setCreateError(null);
    try {
      await createResource({
        title: name.trim(),
        description: description.trim(),
        type,
        isPrivate,
      });
      setName('');
      setDescription('');
      setType('file');
      setIsPrivate(false);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'حدث خطأ في إنشاء المورد');
    } finally {
      setSaving(false);
    }
  };

  const handleAddByCode = async (e: FormEvent) => {
    e.preventDefault();
    if (bindCode.length !== 6) return;
    setBinding(true);
    setBindError(null);
    try {
      await addResourceByCode(bindCode);
      setBindCode('');
      setShowAddByCode(false);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : 'حدث خطأ في إضافة المورد');
    } finally {
      setBinding(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" dir="rtl">
      {/* Back nav */}
      <motion.div {...fadeUp}>
        <Link
          to="/connect"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">العودة للرئيسية</span>
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div {...fadeUp}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الموارد</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              موارد تعليمية مشتركة من طلاب الملتقى
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="ابحث عن مورد..."
              shortcut=""
              className="w-full sm:w-56 md:w-64"
            />
            <Tooltip content="إنشاء مورد جديد" position="top">
              <Button
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowCreate(true)}
                aria-label="إنشاء مورد جديد"
                className="shrink-0 bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 !shadow-amber-500/25 dark:!shadow-amber-500/40"
              >
                {null}
              </Button>
            </Tooltip>
            <Tooltip content="إضافة مورد بالكود" position="top">
              <Button
                size="sm"
                icon={<KeyRound className="w-4 h-4" />}
                onClick={() => setShowAddByCode(true)}
                aria-label="إضافة مورد بالكود"
                className="shrink-0 bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 !shadow-amber-500/25 dark:!shadow-amber-500/40"
              >
                {null}
              </Button>
            </Tooltip>
            <Tooltip content="حول الموارد" position="top">
              <Button
                size="sm"
                icon={<Info className="w-4 h-4" />}
                onClick={() => setShowInfo(true)}
                aria-label="حول الموارد"
                className="shrink-0 bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 !shadow-amber-500/25 dark:!shadow-amber-500/40"
              >
                {null}
              </Button>
            </Tooltip>
          </div>
        </div>
      </motion.div>

      {/* Resources list */}
      {loading && resources.length === 0 ? (
        <div className="flex justify-center py-16" dir="rtl">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        normalizedQuery ? (
          <EmptyState
            icon={<SearchX className="w-8 h-8" />}
            title={`لا توجد نتائج لـ "${query.trim()}"`}
            description="جرّب البحث بكلمات أخرى أو ألغِ البحث لعرض كل الموارد"
            action={{ label: 'مسح البحث', onClick: () => setQuery('') }}
          />
        ) : (
          <EmptyState
            icon={<BookOpen className="w-8 h-8" />}
            title="لا توجد موارد بعد"
            description="سيتم هنا عرض الموارد التعليمية المشتركة من طلاب الملتقى"
          />
        )
      ) : (
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="space-y-3"
        >
          {filtered.map((r) => {
            const Icon = typeIcons[r.type];
            return (
              <motion.div key={r.id} variants={fadeUp}>
                <Link to={`/connect/resources/${r.id}`} className="block group">
                  <motion.div
                    whileHover={{ y: -3, scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="group relative rounded-2xl bg-white dark:bg-dark-card border border-light-border dark:border-dark-border shadow-card dark:shadow-card-dark hover:shadow-soft dark:hover:shadow-card-dark transition-all duration-300 overflow-hidden"
                  >
                    {/* Top accent line */}
                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-amber-400 to-orange-500 opacity-70 group-hover:opacity-100 transition-opacity" />

                    <div className="p-4 pt-5">
                      {/* Header: icon + title + description */}
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate leading-snug">
                            {r.title}
                          </h3>
                          {r.description && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                              {r.description}
                            </p>
                          )}
                        </div>
                        <ChevronLeft className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-primary-400 dark:group-hover:text-primary-500 transition-colors" />
                      </div>

                      {/* Footer: meta */}
                      <div className="flex items-center pt-2.5 border-t border-light-border/60 dark:border-dark-border/60">
                        <div className="flex items-center gap-3.5 text-[11px] text-gray-400 dark:text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            {r.uploadedBy}
                          </span>
                          <span>{typeLabels[r.type]}</span>
                          {r.isPrivate && (
                            <Chip label="خاص" variant="warning" icon={<Lock className="w-3 h-3" />} className="!px-2 !py-0.5 !text-[10px]" />
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create Resource Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="إنشاء مورد جديد"
        description="أضف مادة تعليمية جديدة ليتشاركها طلاب الملتقى"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="اسم المادة"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder=" مثال: أناتومي "
          />
          <TextArea
            label="الوصف (اختياري)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف موجز للمادة"
          />
          <Select
            label="النوع"
            value={type}
            onChange={(e) => setType(e.target.value as ResourceType)}
            options={typeOptions}
          />
          <Select
            label="الظهور"
            value={isPrivate ? 'private' : 'public'}
            onChange={(e) => setIsPrivate(e.target.value === 'private')}
            options={visibilityOptions}
          />
          {createError && (
            <p className="text-sm text-red-500" role="alert">{createError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            <Button type="submit" loading={saving} className="flex-1 bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 !shadow-amber-500/25 dark:!shadow-amber-500/40" icon={<Plus className="w-4 h-4" />}>إنشاء</Button>
          </div>
        </form>
      </Modal>

      {/* Add Resource by Code Modal */}
      <Modal
        open={showAddByCode}
        onClose={() => { setShowAddByCode(false); setBindError(null); }}
        title="إضافة مورد بالكود"
        description="أدخل رمز الوصول المكوّن من 6 أرقام لإضافة مورد خاص إلى قائمتك"
      >
        <form onSubmit={handleAddByCode} className="space-y-4">
          <Input
            label="رمز الوصول"
            value={bindCode}
            onChange={(e) => setBindCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            dir="ltr"
          />
          {bindError && (
            <p className="text-sm text-red-500" role="alert">{bindError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddByCode(false)} className="flex-1">إلغاء</Button>
            <Button
              type="submit"
              loading={binding}
              disabled={bindCode.length !== 6}
              className="flex-1 bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 !shadow-amber-500/25 dark:!shadow-amber-500/40"
              icon={<KeyRound className="w-4 h-4" />}
            >
              إضافة
            </Button>
          </div>
        </form>
      </Modal>

      {/* Info Modal */}
      <Modal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        title="حول الموارد"
        description="كل ما تحتاج معرفته عن صفحة الموارد"
      >
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pe-1">
          {infoPoints.map((point) => (
            <div
              key={point.title}
              className="rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border p-4"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                {point.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
