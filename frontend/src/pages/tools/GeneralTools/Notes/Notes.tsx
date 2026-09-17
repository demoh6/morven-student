import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToolHero } from '@/pages/tools/ToolHero';
import { Input, Button, Modal, EmptyState } from '@/components/UI';
import { NoteCard } from '@/pages/tools/GeneralTools/Notes/NoteCard';
import { NoteEditor } from '@/pages/tools/GeneralTools/Notes/NoteEditor';
import { useNotesStore } from '@/pages/tools/GeneralTools/Notes/useNotesStore';
import { NotebookPen, Search, Plus, StickyNote } from 'lucide-react';

export default function NotesPage() {
  const notes = useNotesStore((s) => s.notes);
  const aliases = useNotesStore((s) => s.aliases);
  const createNote = useNotesStore((s) => s.createNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const togglePin = useNotesStore((s) => s.togglePin);
  const searchNotes = useNotesStore((s) => s.searchNotes);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const visibleNotes = useMemo(() => searchNotes(searchQuery), [searchQuery, notes, searchNotes]);

  // A freshly-created note starts with a local uuid; once its create-sync is
  // acknowledged the store swaps it for the server id while keeping the local
  // uuid in `aliases`. Resolve through the map so the editor never loses the
  // note it is editing mid-typing.
  const resolveId = (id: string) => aliases[id] ?? id;
  const editingNote = editingId ? notes.find((n) => n.id === resolveId(editingId)) : undefined;

  const pinnedNotes = visibleNotes.filter((n) => n.pinned);
  const unpinnedNotes = visibleNotes.filter((n) => !n.pinned);

  const handleNewNote = () => {
    const id = createNote();
    setEditingId(id);
  };

  const renderNote = (id: string) => {
    const targetId = resolveId(id);
    const note = notes.find((n) => n.id === targetId);
    if (!note) return null;

    if (editingId && resolveId(editingId) === targetId) {
      return (
        <NoteEditor
          key={note.id}
          note={note}
          onDone={() => setEditingId(null)}
          onTitleChange={(value) => updateNote(targetId, { title: value })}
          onContentChange={(value) => updateNote(targetId, { content: value })}
        />
      );
    }

    return (
      <NoteCard
        key={note.id}
        note={note}
        onEdit={() => setEditingId(targetId)}
        onDelete={() => setDeleteConfirmId(targetId)}
        onTogglePin={() => togglePin(targetId)}
      />
    );
  };

  return (
    <div className="space-y-6">
      <ToolHero
        icon={<NotebookPen className="w-6 h-6" />}
        title="الملاحظات"
        description="أنشئ واحفظ ملاحظاتك بسرعة مع حفظ تلقائي."
      />

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في ملاحظاتك..."
          icon={<Search className="w-4 h-4" />}
          wrapperClassName="flex-1"
          aria-label="البحث في الملاحظات"
        />
        <Button onClick={handleNewNote} icon={<Plus className="w-4 h-4" />} className="shrink-0">
          ملاحظة جديدة
        </Button>
      </motion.div>

      {/* Content */}
      {notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="w-9 h-9" />}
          title="لا توجد ملاحظات حتى الآن"
          description="ابدأ بإنشاء أول ملاحظة."
          action={{ label: 'إنشاء ملاحظة', onClick: handleNewNote }}
        />
      ) : visibleNotes.length === 0 ? (
        <EmptyState
          icon={<Search className="w-9 h-9" />}
          title="لا توجد نتائج"
          description="جرّب البحث بكلمات مختلفة"
        />
      ) : (
        <div className="space-y-6">
          {pinnedNotes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                مثبتة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {pinnedNotes.map((n) => renderNote(n.id))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {unpinnedNotes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                كل الملاحظات
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {unpinnedNotes.map((n) => renderNote(n.id))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="حذف الملاحظة"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          هل أنت متأكد من حذف هذه الملاحظة؟ لا يمكن التراجع عن هذا الإجراء.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDeleteConfirmId(null)} className="flex-1">
            إلغاء
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleteConfirmId) {
                deleteNote(deleteConfirmId);
                if (editingId && resolveId(editingId) === deleteConfirmId) setEditingId(null);
                setDeleteConfirmId(null);
              }
            }}
            className="flex-1"
          >
            حذف
          </Button>
        </div>
      </Modal>
    </div>
  );
}
