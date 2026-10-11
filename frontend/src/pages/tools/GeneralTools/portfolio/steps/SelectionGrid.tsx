import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { Button, Card, Input, Badge } from '@/components/UI';

export interface SelectionOption {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  badgeVariant?: 'neutral' | 'info' | 'primary' | 'success';
  initials?: string;
  accent?: string;
}

interface SelectionGridProps {
  icon?: ReactNode;
  title: string;
  description: string;
  options: SelectionOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
  continueDisabled?: boolean;
  backLabel?: string;
  continueLabel?: string;
  searchPlaceholder: string;
  emptyLabel: string;
}

export default function SelectionGrid({
  icon,
  title,
  description,
  options,
  selectedId,
  onSelect,
  onContinue,
  onBack,
  continueDisabled = false,
  backLabel,
  continueLabel,
  searchPlaceholder,
  emptyLabel,
}: SelectionGridProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.title.toLowerCase().includes(q) ||
        (o.subtitle?.toLowerCase().includes(q) ?? false) ||
        (o.badge?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  return (
    <div className="space-y-5">
      {icon && <div className="flex justify-center">{icon}</div>}

      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{title}</h2>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      <Input
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        }
      />

      {filtered.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((opt, i) => {
            const selected = opt.id === selectedId;
            return (
              <motion.div
                key={opt.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
              >
                <Card
                  hoverable
                  onClick={() => onSelect(opt.id)}
                  className={`relative transition-all duration-200 ${
                    selected
                      ? 'ring-2 ring-primary-500 border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
                      : ''
                  }`}
                  padding="sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ background: opt.accent ?? '#6366f1' }}
                    >
                      {opt.initials ?? opt.title.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-white truncate">{opt.title}</p>
                      {opt.subtitle && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{opt.subtitle}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {opt.badge && (
                          <Badge variant={opt.badgeVariant ?? 'neutral'} size="sm">
                            {opt.badge}
                          </Badge>
                        )}
                        {opt.meta && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">{opt.meta}</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                        selected ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />}>
          {backLabel ?? 'رجوع'}
        </Button>
        <Button onClick={onContinue} disabled={continueDisabled}>
          {continueLabel ?? 'متابعة'}
        </Button>
      </div>
    </div>
  );
}