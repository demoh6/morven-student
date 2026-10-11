import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/UI/Button';
import { Input } from '@/components/UI/Input';
import { Modal } from '@/components/UI/Modal';
import { EmptyState } from '@/components/UI/EmptyState';
import { StudyGroupCard } from '@/pages/connect/Groups/StudyGroupCard';
import { listGroups, createGroup, joinGroup, type Group } from '@/services/groupApi';
import { cacheGet, cacheSet } from '@/services/offlineCache';
import { userFacingMessage } from '@/services/apiError';
import { Users, Plus, LogIn, ChevronLeft, ImagePlus, X } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const createImageRef = useRef<HTMLInputElement>(null);

  const loadGroups = async () => {
    try {
      const { groups: g } = await listGroups();
      setGroups(g);
      void cacheSet('groups:list', g);
    } catch (err) {
      // Offline / unreachable — serve the last cached list if we have one.
      const cached = await cacheGet<Group[]>('groups:list', { allowStale: true });
      if (cached) {
        setGroups(cached.value);
        setError(null);
      } else {
        setError(userFacingMessage(err, 'حدث خطأ'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createGroup({ name: newName, description: newDesc || undefined, image: newImage || undefined });
      setNewName('');
      setNewDesc('');
      setNewImage(null);
      setNewImagePreview(null);
      setShowCreate(false);
      await loadGroups();
    } catch (err) {
      setError(userFacingMessage(err, 'حدث خطأ'));
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await joinGroup(joinCode);
      setJoinCode('');
      setShowJoin(false);
      await loadGroups();
    } catch (err) {
      setError(userFacingMessage(err, 'حدث خطأ'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">المجموعات</h1>
             <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    أنشئ مجموعة أو انضم لمجموعة مع أصدقائك
                  </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<LogIn className="w-4 h-4" />}
              onClick={() => setShowJoin(true)}
            >
              انضمام
            </Button>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreate(true)}
            >
              إنشاء
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </motion.div>
      )}

      {/* Create Group Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setNewImage(null); setNewImagePreview(null); }} title="إنشاء مجموعة جديدة" description="أنشئ مجموعة جديدة للتعاون والعمل الجماعي">
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Image upload */}
          <div>
            <input ref={createImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 2 * 1024 * 1024) { setError('حجم الصورة يجب أن يكون أقل من 2 ميجا'); return; }
                setNewImage(file);
                const reader = new FileReader();
                reader.onload = (ev) => setNewImagePreview(ev.target?.result as string);
                reader.readAsDataURL(file);
              }
            }} />
            {newImagePreview ? (
              <div className="relative w-20 h-20 mx-auto">
                <img src={newImagePreview} alt="معاينة" className="w-20 h-20 rounded-2xl object-cover border border-light-border dark:border-dark-border" />
                <button type="button" onClick={() => { setNewImage(null); setNewImagePreview(null); if (createImageRef.current) createImageRef.current.value = ''; }} className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => createImageRef.current?.click()} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-dark-border hover:border-primary-400 dark:hover:border-primary-500 transition-colors text-gray-400 dark:text-gray-500 hover:text-primary-500">
                <ImagePlus className="w-5 h-5" />
                <span className="text-sm">إضافة صورة المجموعة (اختياري)</span>
              </button>
            )}
          </div>
          <Input label="اسم المجموعة" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <Input label="الوصف (اختياري)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setNewImage(null); setNewImagePreview(null); }} className="flex-1">إلغاء</Button>
            <Button type="submit" loading={saving} className="flex-1" icon={<Plus className="w-4 h-4" />}>إنشاء المجموعة</Button>
          </div>
        </form>
      </Modal>

      {/* Join Group Modal */}
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="الانضمام لمجموعة" description="أدخل رمز الانضمام المكون من 6 أرقام للانضمام لمجموعة مع لأصدقائك">
        <form onSubmit={handleJoin} className="space-y-4">
          <Input
            label="رمز الانضمام (6 أرقام)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            required
            maxLength={6}
            dir="ltr"
            placeholder="000000"
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowJoin(false)} className="flex-1">إلغاء</Button>
            <Button type="submit" loading={saving} variant="success" className="flex-1" icon={<LogIn className="w-4 h-4" />}>انضمام</Button>
          </div>
        </form>
      </Modal>

      {/* Groups list */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title="لا توجد مجموعات بعد"
          description="أنشئ مجموعة جديدة أو انضم بمجموعة مع لأصدقائك باستخدام رمز الانضمام"
          action={{ label: 'إنشاء مجموعة', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-3">
          {groups.map((g) => (
            <motion.div key={g.id} variants={fadeUp}>
              <StudyGroupCard group={g} showArrow />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
