import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card } from '@/components/UI/Card';
import { Button } from '@/components/UI/Button';
import { Input, TextArea, Select } from '@/components/UI/Input';
import { CachedImage } from '@/components/UI/CachedImage';
import { getOwnProfile, updateOwnProfile, uploadAvatar, removeAvatar, type OwnProfile } from '@/services/profileApi';
import { cacheGet, cacheSet } from '@/services/offlineCache';
import { enqueueMutation, isRetryableError } from '@/services/offlineQueue';
import { useAuthStore } from '@/pages/auth/useAuthStore';
import { ChevronLeft, User, Shield, LogOut, Camera, Trash2, Check, X } from 'lucide-react';

const PROFILE_CACHE_KEY = 'profile:own';
const PROFILE_UPDATE_KEY = 'profile:update';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export default function AccountPage() {
  const { user, logout, setAvatarUrl } = useAuthStore();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const apply = (p: OwnProfile) => {
        setProfile(p);
        setDisplayName(p.displayName);
        setBio(p.bio || '');
        setIsPublic(p.isPublic);
      };
      try {
        const { profile: p } = await getOwnProfile();
        if (cancelled) return;
        apply(p);
        void cacheSet(PROFILE_CACHE_KEY, p);
      } catch (err) {
        // Offline / unreachable — fall back to the last cached profile so the
        // account settings page still renders instead of erroring out.
        const cached = await cacheGet<OwnProfile>(PROFILE_CACHE_KEY, {
          allowStale: true,
        });
        if (cancelled) return;
        if (cached) {
          apply(cached.value);
        } else {
          setError(err instanceof Error ? err.message : 'حدث خطأ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    const input = {
      displayName,
      bio: bio || undefined,
      isPublic,
    };
    try {
      const { profile: updated } = await updateOwnProfile(input);
      setProfile(updated);
      void cacheSet(PROFILE_CACHE_KEY, updated);
      setSuccess(true);
      successTimer.current = setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      if (isRetryableError(err)) {
        // Offline — queue the update (last-write-wins) and reflect it locally.
        const optimistic = profile
          ? { ...profile, displayName, bio: bio || null, isPublic }
          : profile;
        if (optimistic) {
          setProfile(optimistic);
          void cacheSet(PROFILE_CACHE_KEY, optimistic);
        }
        void enqueueMutation({
          type: 'profile.update',
          payload: input,
          idempotencyKey: PROFILE_UPDATE_KEY,
          replace: true,
        });
        setSuccess(true);
        successTimer.current = setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('حجم الصورة يجب أن يكون أقل من 2 ميجا');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setError(null);
  };

  const handleAvatarConfirm = async () => {
    if (!pendingFile) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const { avatarUrl } = await uploadAvatar(pendingFile);
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, avatarUrl };
        void cacheSet(PROFILE_CACHE_KEY, next);
        return next;
      });
      setAvatarUrl(avatarUrl);
      setAvatarPreview(null);
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAvatarCancel = () => {
    setAvatarPreview(null);
    setPendingFile(null);
    setError(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    setError(null);
    try {
      await removeAvatar();
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, avatarUrl: null };
        void cacheSet(PROFILE_CACHE_KEY, next);
        return next;
      });
      setAvatarUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setAvatarUploading(false);
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
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      {/* Back nav */}
      <motion.div {...fadeUp}>
        <Link
          to="/connect"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="text-sm font-medium">العودة</span>
        </Link>
      </motion.div>

      {/* Avatar section */}
      <motion.div {...fadeUp}>
        <Card padding="lg" className="mb-6 relative overflow-hidden">
          <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-primary-100/40 dark:bg-primary-900/15 blur-2xl pointer-events-none" />
          <div className="relative">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Camera className="w-5 h-5 text-gray-400" />
              الصورة الشخصية
            </h2>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Avatar preview */}
              <div className="relative shrink-0">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarFileSelect}
                />
                {avatarUploading ? (
                  <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-dark-surface flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="معاينة"
                    className="w-24 h-24 rounded-full object-cover border-3 border-primary-400 dark:border-primary-500"
                  />
                ) : (
                  <CachedImage
                    src={profile?.avatarUrl}
                    alt={profile?.displayName || 'الصورة الشخصية'}
                    className="w-24 h-24 rounded-full object-cover border-3 border-light-border dark:border-dark-border"
                    fallback={
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-emerald-500 text-white shadow-lg shadow-primary-500/20 flex items-center justify-center text-4xl font-bold">
                        {profile?.displayName?.charAt(0) || user?.displayName?.charAt(0) || 'م'}
                      </div>
                    }
                  />
                )}
              </div>

              {/* Avatar actions */}
              <div className="flex flex-col gap-2">
                {avatarPreview ? (
                  <>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">معاينة الصورة الجديدة</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAvatarConfirm}
                        loading={avatarUploading}
                        icon={<Check className="w-4 h-4" />}
                      >
                        تأكيد
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleAvatarCancel}
                        icon={<X className="w-4 h-4" />}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => avatarInputRef.current?.click()}
                      icon={<Camera className="w-4 h-4" />}
                    >
                      تغيير الصورة
                    </Button>
                    {profile?.avatarUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleAvatarRemove}
                        loading={avatarUploading}
                        icon={<Trash2 className="w-4 h-4" />}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10"
                      >
                        حذف الصورة
                      </Button>
                    )}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      JPG، PNG أو WebP. حد أقصى 2 ميجا.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Edit form */}
      <motion.div {...fadeUp}>
        <Card padding="lg">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            تعديل الملف الشخصي
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
                تم الحفظ بنجاح
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-dark-surface">
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">اسم المستخدم</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white" dir="ltr">{profile?.username}</span>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-dark-surface">
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">البريد الإلكتروني</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white" dir="ltr">{profile?.email}</span>
              </div>
            </div>

            <Input label="الاسم المعروض" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoComplete="name" />

            <TextArea label="السيرة الذاتية" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="اكتب شيئاً عن نفسك..." maxLength={500} helperText={`${bio.length}/500`} />

            <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-dark-surface">
              <Shield className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="flex-1">
                <Select
                  label="الخصوصية"
                  value={isPublic ? 'public' : 'private'}
                  onChange={(e) => setIsPublic(e.target.value === 'public')}
                  options={[
                    { value: 'public', label: 'عام — الجميع يمكنه رؤية ملفك الشخصي' },
                    { value: 'private', label: 'خاص — ملفك الشخصي ليس مرئياً للآخرين' },
                  ]}
                />
              </div>
            </div>

            <Button type="submit" loading={saving} className="w-full" size="lg">
              حفظ التغييرات
            </Button>
          </form>
        </Card>
      </motion.div>

      {/* Logout section */}
      <motion.div {...fadeUp} className="mt-6">
        <button
          onClick={async () => { await logout(); window.location.href = '/'; }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 border border-red-200/50 dark:border-red-500/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </motion.div>
    </div>
  );
}
