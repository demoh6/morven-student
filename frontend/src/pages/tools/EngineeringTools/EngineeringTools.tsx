import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getToolById } from '@/data/tools';
import {
  Button,
  Card,
  Input,
  TextArea,
  Select,
  Badge,
  EmptyState,
  Slider,
} from '@/components/UI';
import { ToolLayout } from '@/pages/tools/ToolLayout';
import { ToolHero } from '@/pages/tools/ToolHero';
import { useAppStore } from '@/store/useAppStore';
import QRCode from 'qrcode';
import { saveToLibrary } from '@/services/savedFilesService';

// =============================================================================
// Shared helpers
// =============================================================================

function ResultBox({
  title,
  value,
  placeholder,
  mono = true,
  onClear,
}: {
  title: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onClear?: () => void;
}) {
  const { addNotification } = useAppStore();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      addNotification('تم النسخ إلى الحافظة', 'success');
    } catch {
      addNotification('فشل النسخ', 'error');
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
        <div className="flex items-center gap-2">
          {value && (
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {'نسخ'}
            </Button>
          )}
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              {'مسح'}
            </Button>
          )}
        </div>
      </div>
      <pre
        dir="ltr"
        className={`w-full min-h-[100px] max-h-80 overflow-auto rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border p-4 text-sm ${
          mono ? 'font-mono' : ''
        } text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words`}
      >
        {value || placeholder || 'ستظهر النتيجة هنا'}
      </pre>
    </Card>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{children}</span>
  );
}

// =============================================================================
// 1. JSON FORMATTER
// =============================================================================

function JsonFormatter() {
  const { addNotification } = useAppStore();
  const [input, setInput] = useState('{\n  "name": "Morven",\n  "version": 1\n}');
  const [indent, setIndent] = useState('2');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(input);
      const size = parseInt(indent, 10);
      setOutput(JSON.stringify(parsed, null, size));
      setError('');
      addNotification('تم تنسيق JSON بنجاح', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setOutput('');
      addNotification('JSON غير صالح', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'إدخال JSON'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={8}
          className="font-mono"
          placeholder='{ "key": "value" }'
        />
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={'المسافة البادئة'}
            options={[
              { value: '2', label: '2 ' + 'فراغات' },
              { value: '4', label: '4 ' + 'فراغات' },
              { value: '0', label: 'مصغر' },
            ]}
            value={indent}
            onChange={(e) => setIndent(e.target.value)}
            wrapperClassName="sm:w-44"
          />
          <Button onClick={handleFormat} className="flex-1 sm:flex-none">
            {'التنسيق'}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-500" dir="ltr">
            {error}
          </p>
        )}
      </Card>
      <ResultBox
        title={'JSON منسق'}
        value={output}
        onClear={() => setOutput('')}
      />
    </div>
  );
}

// =============================================================================
// 2. JSON VALIDATOR
// =============================================================================

function JsonValidator() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'valid' | 'invalid' | null>(null);
  const [message, setMessage] = useState('');

  const handleValidate = () => {
    try {
      JSON.parse(input);
      setResult('valid');
      setMessage('JSON صالح');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult('invalid');
      setMessage(msg);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'إدخال JSON'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          className="font-mono"
          placeholder='{ "key": "value" }'
        />
        <Button onClick={handleValidate} disabled={!input.trim()}>
          {'تحقق'}
        </Button>
      </Card>
      {result && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card
              className={`border-2 ${
                result === 'valid'
                  ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/10'
                  : 'border-red-500/40 bg-red-50 dark:bg-red-900/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{result === 'valid' ? '✅' : '❌'}</span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold ${
                      result === 'valid' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {result === 'valid' ? 'JSON صالح' : 'JSON غير صالح'}
                  </p>
                  {result === 'invalid' && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 break-words" dir="ltr">
                      {message}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// =============================================================================
// 3. REGEX TESTER
// =============================================================================

function RegexTester() {
  const [pattern, setPattern] = useState('\\b\\w+\\b');
  const [flags, setFlags] = useState('gi');
  const [text, setText] = useState('The quick brown fox jumps over the lazy dog.');
  const [matches, setMatches] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleTest = () => {
    try {
      const regex = new RegExp(pattern, flags);
      setMatches(text.match(regex) ?? []);
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMatches([]);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={'التعبير النمطي'}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="font-mono"
            dir="ltr"
            placeholder="\d+"
          />
          <Input
            label={'الأعلام'}
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            className="font-mono"
            dir="ltr"
            placeholder="gi"
          />
        </div>
        <TextArea
          label={'نص التجربة'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleTest}>{'اختبار'}</Button>
          {matches.length > 0 && (
            <Badge variant="success">
              {'عدد التطابقات'}: {matches.length}
            </Badge>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-500" dir="ltr">
            {error}
          </p>
        )}
      </Card>
      {matches.length > 0 && (
        <Card className="space-y-3">
          <FieldLabel>{'التطابقات'}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {matches.map((m, i) => (
              <Badge key={i} variant="primary">
                {m}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 4. UUID GENERATOR
// =============================================================================

function generateUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function UuidGenerator() {
  const [count, setCount] = useState(5);
  const [uuids, setUuids] = useState<string[]>([]);

  const handleGenerate = () => {
    setUuids(Array.from({ length: count }, generateUuid));
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={'العدد'}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={String(count)}
            onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
            wrapperClassName="sm:w-40"
          />
          <Button onClick={handleGenerate}>{'توليد UUIDs'}</Button>
        </div>
      </Card>
      {uuids.length > 0 && (
        <Card className="space-y-3">
          <FieldLabel>{'UUIDs المولدة'}</FieldLabel>
          <div className="space-y-1.5">
            {uuids.map((uuid, i) => (
              <div
                key={i}
                className="rounded-lg bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border px-3 py-2 font-mono text-sm text-gray-800 dark:text-gray-100"
                dir="ltr"
              >
                {uuid}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 5. BASE64 ENCODER / DECODER
// =============================================================================

function Base64Tool() {
  const { addNotification } = useAppStore();
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const handleConvert = () => {
    try {
      if (mode === 'encode') {
        setOutput(btoa(unescape(encodeURIComponent(input))));
      } else {
        setOutput(decodeURIComponent(escape(atob(input.trim()))));
      }
    } catch {
      setOutput('');
      addNotification('إدخال Base64 غير صالح', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Select
          label={'الوضع'}
          options={[
            { value: 'encode', label: 'تشفير' },
            { value: 'decode', label: 'فك التشفير' },
          ]}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'encode' | 'decode');
            setOutput('');
          }}
        />
        <TextArea
          label={mode === 'encode' ? 'نص عادي' : 'نص Base64'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          className="font-mono"
        />
        <Button onClick={handleConvert} disabled={!input.trim()}>
          {'تحويل'}
        </Button>
      </Card>
      <ResultBox
        title={mode === 'encode' ? 'مخرجات Base64' : 'النص المفكوك'}
        value={output}
        onClear={() => setOutput('')}
      />
    </div>
  );
}

// =============================================================================
// 6. HASH GENERATOR
// =============================================================================

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function HashGenerator() {
  const { addNotification } = useAppStore();
  const [input, setInput] = useState('');
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [output, setOutput] = useState('');

  const handleGenerate = async () => {
    try {
      const data = new TextEncoder().encode(input);
      const buf = await crypto.subtle.digest(algorithm, data);
      setOutput(toHex(buf));
      addNotification('تم توليد البصمة', 'success');
    } catch {
      addNotification('خطأ في توليد البصمة', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'النص المدخل'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={'الخوارزمية'}
            options={[
              { value: 'SHA-1', label: 'SHA-1' },
              { value: 'SHA-256', label: 'SHA-256' },
              { value: 'SHA-384', label: 'SHA-384' },
              { value: 'SHA-512', label: 'SHA-512' },
            ]}
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            wrapperClassName="sm:w-44"
          />
          <Button onClick={handleGenerate} disabled={!input.trim()}>
            {'توليد البصمة'}
          </Button>
        </div>
      </Card>
      <ResultBox
        title={`${algorithm} ${'البصمة'}`}
        value={output}
        onClear={() => setOutput('')}
      />
    </div>
  );
}

// =============================================================================
// 7. PASSWORD GENERATOR
// =============================================================================

function PasswordGeneratorTool() {
  const { addNotification } = useAppStore();
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState('');

  const generate = () => {
    const sets: string[] = [];
    if (uppercase) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (lowercase) sets.push('abcdefghijklmnopqrstuvwxyz');
    if (numbers) sets.push('0123456789');
    if (symbols) sets.push('!@#$%^&*()_+-=[]{}|;:,.<>?');
    if (sets.length === 0) {
      addNotification('اختر مجموعة أحرف واحدة على الأقل', 'warning');
      return;
    }
    const all = sets.join('');
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += all[array[i] % all.length];
    }
    // Ensure at least one char from each selected set
    let final = result;
    sets.forEach((s) => {
      const rand = new Uint32Array(1);
      crypto.getRandomValues(rand);
      final = final.slice(0, -1) + s[rand[0] % s.length];
    });
    setPassword(final);
  };

  return (
    <div className="space-y-8">
      <Card className="space-y-5">
        <Input
          type="number"
          min={6}
          max={64}
          value={length}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setLength(Math.min(64, Math.max(6, v)));
          }}
          label={'الطول'}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: 'uppercase', label: 'أحرف كبيرة', value: uppercase, set: setUppercase },
            { key: 'lowercase', label: 'أحرف صغيرة', value: lowercase, set: setLowercase },
            { key: 'numbers', label: 'أرقام', value: numbers, set: setNumbers },
            { key: 'symbols', label: 'رموز', value: symbols, set: setSymbols },
          ].map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={opt.value}
                onChange={(e) => opt.set(e.target.checked)}
                className="w-4 h-4 accent-primary-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </Card>

      <div className="flex justify-center py-1">
        <Button onClick={generate} disabled={!uppercase && !lowercase && !numbers && !symbols}>
          {'توليد كلمة المرور'}
        </Button>
      </div>

      {password && (
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{'كلمة المرور'}</h3>
            <div className="flex items-center gap-4">
              <Button variant="secondary" size="sm" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(password);
                  addNotification('تم النسخ إلى الحافظة', 'success');
                } catch {
                  addNotification('فشل النسخ', 'error');
                }
              }}>
                {'نسخ'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPassword('')}>
                {'مسح'}
              </Button>
            </div>
          </div>
          <pre
            dir="ltr"
            className="w-full min-h-[100px] max-h-80 overflow-auto rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border p-4 text-sm font-mono text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words"
          >
            {password}
          </pre>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 8. HTML PREVIEW
// =============================================================================

function HtmlPreview() {
  const [html, setHtml] = useState(
    '<h1>Hello Morven!</h1>\n<p>This is a live <strong>HTML</strong> preview.</p>',
  );
  const [srcDoc, setSrcDoc] = useState(
    '<h1>Hello Morven!</h1>\n<p>This is a live <strong>HTML</strong> preview.</p>',
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'كود HTML'}
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          className="font-mono"
        />
        <Button onClick={() => setSrcDoc(html)}>{'تحديث المعاينة'}</Button>
      </Card>
      <Card className="space-y-3">
        <FieldLabel>{'معاينة'}</FieldLabel>
        <div className="rounded-xl border border-light-border dark:border-dark-border overflow-hidden bg-white">
          <iframe
            title={'معاينة HTML'}
            srcDoc={srcDoc}
            className="w-full min-h-[280px] bg-white"
            sandbox="allow-same-origin"
          />
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// 9. SVG VIEWER
// =============================================================================

function SvgViewer() {
  const [svg, setSvg] = useState(
    '<svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">\n  <rect x="10" y="10" width="120" height="60" rx="8" fill="#4f46e5" />\n  <circle cx="160" cy="40" r="28" fill="#f59e0b" />\n</svg>',
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'كود SVG'}
          value={svg}
          onChange={(e) => setSvg(e.target.value)}
          rows={10}
          className="font-mono"
        />
      </Card>
      <Card className="space-y-3">
        <FieldLabel>{'معاينة'}</FieldLabel>
        <div className="rounded-xl border border-light-border dark:border-dark-border overflow-hidden bg-white flex items-center justify-center min-h-[280px] p-6">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// 10. COLOR PICKER
// =============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function ColorPicker() {
  const [color, setColor] = useState('#4f46e5');
  const rgb = hexToRgb(color);
  const hsl = (() => {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  })();

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-16 h-16 rounded-xl cursor-pointer border border-light-border dark:border-dark-border"
        />
        <div>
          <FieldLabel>{'اختر لوناً'}</FieldLabel>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono" dir="ltr">
            {color}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultBox title="HEX" value={color} />
        <ResultBox title="RGB" value={`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`} />
        <ResultBox title="HSL" value={`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`} />
      </div>
    </Card>
  );
}

// =============================================================================
// 11. GRADIENT GENERATOR
// =============================================================================

function GradientGenerator() {
  const [from, setFrom] = useState('#4f46e5');
  const [to, setTo] = useState('#ec4899');
  const [angle, setAngle] = useState(135);
  const css = `linear-gradient(${angle}deg, ${from}, ${to})`;

  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>{'من اللون'}</FieldLabel>
            <input
              type="color"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-2 w-16 h-12 rounded-lg cursor-pointer border border-light-border dark:border-dark-border"
            />
          </div>
          <div>
            <FieldLabel>{'إلى اللون'}</FieldLabel>
            <input
              type="color"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-2 w-16 h-12 rounded-lg cursor-pointer border border-light-border dark:border-dark-border"
            />
          </div>
        </div>
        <Slider
          min={0}
          max={360}
          value={angle}
          onChange={setAngle}
          label={'الزاوية (درجة)'}
          minLabel="0°"
          maxLabel="360°"
        />
        <div
          className="h-28 rounded-xl border border-light-border dark:border-dark-border"
          style={{ background: css }}
        />
      </Card>
      <ResultBox title={'كود CSS'} value={`background: ${css};`} onClear={() => undefined} />
    </div>
  );
}

// =============================================================================
// 11a. CSS BEAUTIFIER
// =============================================================================

function cssTokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      let s = q;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { s += src[i] + (src[i + 1] || ''); i += 2; continue; }
        s += src[i]; i++;
      }
      if (i < src.length) { s += src[i]; i++; }
      tokens.push(s);
    } else if (src[i] === '/' && src[i + 1] === '*') {
      let s = '/*';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { s += src[i]; i++; }
      if (i < src.length) { s += '*/'; i += 2; }
      tokens.push(s);
    } else if (src[i] === '/' && src[i + 1] === '/') {
      let s = '';
      while (i < src.length && src[i] !== '\n') { s += src[i]; i++; }
      tokens.push(s);
    } else {
      let s = '';
      while (i < src.length && src[i] !== '"' && src[i] !== "'" && !(src[i] === '/' && (src[i + 1] === '*' || src[i + 1] === '/'))) {
        s += src[i]; i++;
      }
      if (s) tokens.push(s);
    }
  }
  return tokens;
}

function beautifyCss(src: string): string {
  const tokens = cssTokenize(src);
  const flat = tokens.join('');
  let out = '';
  let indent = 0;
  const nl = () => '\n' + '  '.repeat(indent);

  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === '{') {
      out = out.trimEnd() + ' {\n';
      indent++;
      out += '  '.repeat(indent);
    } else if (ch === '}') {
      out = out.trimEnd() + '\n';
      indent = Math.max(0, indent - 1);
      out += '  '.repeat(indent) + '}\n\n';
    } else if (ch === ';') {
      out = out.trimEnd() + ';\n' + '  '.repeat(indent);
    } else if (ch === ':' && out.trimEnd().length > 0 && !out.trimEnd().endsWith('&') && !out.trimEnd().endsWith(',')) {
      out = out.trimEnd() + ': ';
      while (i + 1 < flat.length && flat[i + 1] === ' ') i++;
    } else {
      out += ch;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function CssBeautifier() {
  const { addNotification } = useAppStore();
  const [input, setInput] = useState('body { margin: 0; padding: 0; font-family: sans-serif; }\n.container { max-width: 1200px; margin: 0 auto; }\n.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }');
  const [output, setOutput] = useState('');

  const handleFormat = () => {
    try {
      setOutput(beautifyCss(input));
      addNotification('تم تنسيق CSS بنجاح', 'success');
    } catch {
      addNotification('خطأ في تنسيق CSS', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea label={'كود CSS'} value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="font-mono" />
        <Button onClick={handleFormat}>{'تنسيق CSS'}</Button>
      </Card>
      {output && <ResultBox title={'النتيجة'} value={output} onClear={() => setOutput('')} />}
    </div>
  );
}

// =============================================================================
// 11b. CSS MINIFIER
// =============================================================================

function minifyCss(src: string): string {
  const tokens = cssTokenize(src);
  let result = '';
  for (const t of tokens) {
    if (t.startsWith('/*') || t.startsWith('//')) continue;
    result += t;
  }
  return result
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*,\s*/g, ',')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

function CssMinifier() {
  const { addNotification } = useAppStore();
  const [input, setInput] = useState('body {\n  margin: 0;\n  padding: 0;\n  font-family: sans-serif;\n}\n\n.container {\n  max-width: 1200px;\n  margin: 0 auto;\n}');
  const [output, setOutput] = useState('');

  const handleMinify = () => {
    try {
      const min = minifyCss(input);
      setOutput(min);
      addNotification('تم تصغير CSS بنجاح', 'success');
    } catch {
      addNotification('خطأ في تصغير CSS', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea label={'كود CSS'} value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="font-mono" />
        <Button onClick={handleMinify}>{'تصغير CSS'}</Button>
      </Card>
      {output && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{'النتيجة المصغرة'}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">{input.length} → {output.length} حرف</span>
              <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(output); addNotification('تم النسخ', 'success'); }}>{'نسخ'}</Button>
              <Button variant="ghost" size="sm" onClick={() => setOutput('')}>{'مسح'}</Button>
            </div>
          </div>
          <pre dir="ltr" className="w-full min-h-[80px] max-h-80 overflow-auto rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border p-4 text-sm font-mono text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">{output}</pre>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 11c. JS BEAUTIFIER
// =============================================================================

function jsTokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      const q = src[i];
      let s = q;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { s += src[i] + (src[i + 1] || ''); i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
          s += '${';
          i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth > 0) s += src[i];
            i++;
          }
          s += '}';
          continue;
        }
        s += src[i]; i++;
      }
      if (i < src.length) { s += src[i]; i++; }
      tokens.push(s);
    } else if (src[i] === '/' && src[i + 1] === '*') {
      let s = '/*';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { s += src[i]; i++; }
      if (i < src.length) { s += '*/'; i += 2; }
      tokens.push(s);
    } else if (src[i] === '/' && src[i + 1] === '/') {
      let s = '';
      while (i < src.length && src[i] !== '\n') { s += src[i]; i++; }
      tokens.push(s);
    } else {
      let s = '';
      while (i < src.length && src[i] !== '"' && src[i] !== "'" && src[i] !== '`' && !(src[i] === '/' && (src[i + 1] === '*' || src[i + 1] === '/'))) {
        s += src[i]; i++;
      }
      if (s) tokens.push(s);
    }
  }
  return tokens;
}

function beautifyJs(src: string): string {
  const tokens = jsTokenize(src);
  const flat = tokens.join('');
  let out = '';
  let indent = 0;
  const nl = () => '\n' + '  '.repeat(indent);

  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === '{') {
      out = out.trimEnd() + ' {\n';
      indent++;
      out += '  '.repeat(indent);
    } else if (ch === '}') {
      out = out.trimEnd() + '\n';
      indent = Math.max(0, indent - 1);
      out += '  '.repeat(indent) + '}\n';
      if (i + 1 < flat.length && flat[i + 1] === ';') { out += ';'; i++; }
      out += '\n' + '  '.repeat(indent);
    } else if (ch === ';') {
      out = out.trimEnd() + ';\n' + '  '.repeat(indent);
    } else {
      out += ch;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').replace(/\n+\s*$/,'').trim() + '\n';
}

function JsBeautifier() {
  const { addNotification } = useAppStore();
  const [input, setInput] = useState('function greet(name){if(name){console.log("Hello, "+name+"!");return{status:"ok",name:name};}else{return null;}}');
  const [output, setOutput] = useState('');

  const handleFormat = () => {
    try {
      setOutput(beautifyJs(input));
      addNotification('تم تنسيق JavaScript بنجاح', 'success');
    } catch {
      addNotification('خطأ في تنسيق JavaScript', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea label={'كود JavaScript'} value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="font-mono" />
        <Button onClick={handleFormat}>{'تنسيق JavaScript'}</Button>
      </Card>
      {output && <ResultBox title={'النتيجة'} value={output} onClear={() => setOutput('')} />}
    </div>
  );
}

// =============================================================================
// 11d. JS MINIFIER
// =============================================================================

function minifyJs(src: string): string {
  const tokens = jsTokenize(src);
  let result = '';
  for (const t of tokens) {
    if (t.startsWith('/*') || t.startsWith('//')) continue;
    result += t;
  }
  return result
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*=\s*/g, '=')
    .replace(/\s*!=\s*/g, '!=')
    .replace(/\s*!==\s*/g, '!==')
    .replace(/\s*==\s*/g, '==')
    .replace(/\s*===\s*/g, '===')
    .replace(/\s*>\s*/g, '>')
    .replace(/\s*<\s*/g, '<')
    .replace(/\s*<=\s*/g, '<=')
    .replace(/\s*>=\s*/g, '>=')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\*\s*/g, '*')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*&&\s*/g, '&&')
    .replace(/\s*\|\|\s*/g, '||')
    .replace(/;\}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

function JsMinifier() {
  const { addNotification } = useAppStore();
  const [input, setInput] = useState('function greet(name) {\n  if (name) {\n    console.log("Hello, " + name + "!");\n    return { status: "ok", name: name };\n  } else {\n    return null;\n  }\n}');
  const [output, setOutput] = useState('');

  const handleMinify = () => {
    try {
      const min = minifyJs(input);
      setOutput(min);
      addNotification('تم تصغير JavaScript بنجاح', 'success');
    } catch {
      addNotification('خطأ في تصغير JavaScript', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea label={'كود JavaScript'} value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="font-mono" />
        <Button onClick={handleMinify}>{'تصغير JavaScript'}</Button>
      </Card>
      {output && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{'النتيجة المصغرة'}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">{input.length} → {output.length} حرف</span>
              <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(output); addNotification('تم النسخ', 'success'); }}>{'نسخ'}</Button>
              <Button variant="ghost" size="sm" onClick={() => setOutput('')}>{'مسح'}</Button>
            </div>
          </div>
          <pre dir="ltr" className="w-full min-h-[80px] max-h-80 overflow-auto rounded-xl bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border p-4 text-sm font-mono text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">{output}</pre>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 12. CSV <-> JSON
// =============================================================================

function parseCsv(csv: string): string[][] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) {
          cells.push(current);
          current = '';
        } else current += ch;
      }
      cells.push(current);
      return cells.map((c) => c.trim());
    });
}

function CsvJson() {
  const { addNotification } = useAppStore();
  const [mode, setMode] = useState<'csvToJson' | 'jsonToCsv'>('csvToJson');
  const [input, setInput] = useState('name,age,city\nAlice,25,Cairo\nBob,30,Alexandria');
  const [output, setOutput] = useState('');

  const handleConvert = () => {
    try {
      if (mode === 'csvToJson') {
        const rows = parseCsv(input);
        if (rows.length < 1) throw new Error('empty');
        const headers = rows[0];
        const result = rows.slice(1).map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => (obj[h] = row[i] ?? ''));
          return obj;
        });
        setOutput(JSON.stringify(result, null, 2));
      } else {
        const parsed = JSON.parse(input) as Array<Record<string, unknown>>;
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('array');
        const headers = Object.keys(parsed[0]);
        const escapeCsv = (v: unknown) => {
          const s = String(v ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [
          headers.join(','),
          ...parsed.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
        ];
        setOutput(lines.join('\n'));
      }
    } catch {
      setOutput('');
      addNotification(
        mode === 'csvToJson' ? 'إدخال CSV غير صالح' : 'إدخال JSON غير صالح',
        'error',
      );
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Select
          label={'الوضع'}
          options={[
            { value: 'csvToJson', label: 'CSV إلى JSON' },
            { value: 'jsonToCsv', label: 'JSON إلى CSV' },
          ]}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'csvToJson' | 'jsonToCsv');
            setOutput('');
          }}
        />
        <TextArea
          label={mode === 'csvToJson' ? 'بيانات CSV' : 'بيانات JSON'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={8}
          className="font-mono"
        />
        <Button onClick={handleConvert} disabled={!input.trim()}>
          {'تحويل'}
        </Button>
      </Card>
      <ResultBox
        title={mode === 'csvToJson' ? 'مخرجات JSON' : 'مخرجات CSV'}
        value={output}
        onClear={() => setOutput('')}
      />
    </div>
  );
}

// =============================================================================
// 13. MARKDOWN TO HTML
// =============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let list: string[] | null = null;

  const flushList = () => {
    if (list) {
      out.push(`<ul>\n${list.map((li) => `  <li>${li}</li>`).join('\n')}\n</ul>`);
      list = null;
    }
  };

  const inline = (s: string): string =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (/^(-|\*|\+) /.test(line)) {
      if (!list) list = [];
      list.push(inline(line.replace(/^(-|\*|\+) /, '')));
      continue;
    }
    flushList();
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const codeBlock = line.match(/^```/);
    if (codeBlock) {
      const rest = lines.slice(lines.indexOf(raw) + 1);
      const endIdx = rest.findIndex((l) => l.trim().startsWith('```'));
      const code = (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
      out.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      break;
    }
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return out.join('\n');
}

function MarkdownToHtml() {
  const [md, setMd] = useState('# Hello\n\nThis is **bold** and *italic*.\n\n- Item one\n- Item two');
  const html = markdownToHtml(md);

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'إدخال Markdown'}
          value={md}
          onChange={(e) => setMd(e.target.value)}
          rows={10}
          className="font-mono"
        />
      </Card>
      <ResultBox title={'مخرجات HTML'} value={html} onClear={() => setMd('')} />
      <Card className="space-y-3">
        <FieldLabel>{'معاينة'}</FieldLabel>
        <div
          className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 dark:prose-headings:text-white dark:prose-p:text-gray-300 min-h-[120px] rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface p-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Card>
    </div>
  );
}

// =============================================================================
// 14. URL ENCODER / DECODER
// =============================================================================

function UrlEncoder() {
  const { addNotification } = useAppStore();
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState('https://example.com/?q=hello world');
  const [output, setOutput] = useState('');

  const handleConvert = () => {
    try {
      if (mode === 'encode') {
        setOutput(encodeURIComponent(input));
      } else {
        setOutput(decodeURIComponent(input.trim()));
      }
    } catch {
      setOutput('');
      addNotification('إدخال غير صالح', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Select
          label={'الوضع'}
          options={[
            { value: 'encode', label: 'تشفير' },
            { value: 'decode', label: 'فك التشفير' },
          ]}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'encode' | 'decode');
            setOutput('');
          }}
        />
        <TextArea
          label={'الإدخال'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          className="font-mono"
        />
        <Button onClick={handleConvert} disabled={!input.trim()}>
          {'تحويل'}
        </Button>
      </Card>
      <ResultBox
        title={mode === 'encode' ? 'الرابط المشفر' : 'الرابط المفكوك'}
        value={output}
        onClear={() => setOutput('')}
      />
    </div>
  );
}

// =============================================================================
// 15. HTTP STATUS CODES
// =============================================================================

const HTTP_STATUS_CODES: { code: number; name: string; category: string; description: string }[] = [
  { code: 100, name: 'Continue', category: '1xx', description: 'The server has received the request headers.' },
  { code: 200, name: 'OK', category: '2xx', description: 'The request was successful.' },
  { code: 201, name: 'Created', category: '2xx', description: 'A resource was successfully created.' },
  { code: 204, name: 'No Content', category: '2xx', description: 'Request succeeded with no response body.' },
  { code: 301, name: 'Moved Permanently', category: '3xx', description: 'Resource moved permanently to a new URL.' },
  { code: 302, name: 'Found', category: '3xx', description: 'Resource found at a temporary URL.' },
  { code: 304, name: 'Not Modified', category: '3xx', description: 'Cached copy is still valid.' },
  { code: 400, name: 'Bad Request', category: '4xx', description: 'The server could not understand the request.' },
  { code: 401, name: 'Unauthorized', category: '4xx', description: 'Authentication is required.' },
  { code: 403, name: 'Forbidden', category: '4xx', description: 'The client does not have access rights.' },
  { code: 404, name: 'Not Found', category: '4xx', description: 'The requested resource does not exist.' },
  { code: 409, name: 'Conflict', category: '4xx', description: 'The request conflicts with current state.' },
  { code: 422, name: 'Unprocessable Entity', category: '4xx', description: 'The request was well-formed but invalid.' },
  { code: 429, name: 'Too Many Requests', category: '4xx', description: 'The client sent too many requests.' },
  { code: 500, name: 'Internal Server Error', category: '5xx', description: 'A generic server-side error occurred.' },
  { code: 502, name: 'Bad Gateway', category: '5xx', description: 'An invalid response from the upstream server.' },
  { code: 503, name: 'Service Unavailable', category: '5xx', description: 'The server is temporarily unavailable.' },
  { code: 504, name: 'Gateway Timeout', category: '5xx', description: 'The upstream server did not respond in time.' },
];

function HttpStatusCodes() {
  const [query, setQuery] = useState('');

  const filtered = HTTP_STATUS_CODES.filter(
    (s) =>
      String(s.code).includes(query.trim()) ||
      s.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Input
          label={'بحث'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'بحث...'}
        />
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((s) => (
          <Card key={s.code} padding="sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-lg font-bold text-primary-600 dark:text-primary-400">{s.code}</p>
                <p className="font-semibold text-gray-800 dark:text-gray-200">{s.name}</p>
              </div>
              <Badge variant="neutral" size="sm">
                {s.category}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{s.description}</p>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && (
        <EmptyState
          icon={<span className="text-4xl">🔍</span>}
          title={'لا توجد نتائج'}
        />
      )}
    </div>
  );
}

// =============================================================================
// 16. REST METHODS
// =============================================================================

const REST_METHODS: { method: string; purpose: string; safe: boolean; idempotent: boolean; example: string }[] = [
  { method: 'GET', purpose: 'Retrieve a resource', safe: true, idempotent: true, example: 'GET /users' },
  { method: 'POST', purpose: 'Create a new resource', safe: false, idempotent: false, example: 'POST /users' },
  { method: 'PUT', purpose: 'Replace a resource entirely', safe: false, idempotent: true, example: 'PUT /users/1' },
  { method: 'PATCH', purpose: 'Partially update a resource', safe: false, idempotent: false, example: 'PATCH /users/1' },
  { method: 'DELETE', purpose: 'Delete a resource', safe: false, idempotent: true, example: 'DELETE /users/1' },
  { method: 'HEAD', purpose: 'Same as GET without a body', safe: true, idempotent: true, example: 'HEAD /users' },
  { method: 'OPTIONS', purpose: 'Describe communication options', safe: true, idempotent: true, example: 'OPTIONS /users' },
];

function RestMethods() {
  return (
    <div className="space-y-3">
      {REST_METHODS.map((m) => (
        <Card key={m.method} padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-primary-600 dark:text-primary-400 text-lg">{m.method}</span>
              <span className="text-sm text-gray-600 dark:text-gray-300">{m.purpose}</span>
            </div>
            <div className="flex gap-2">
              <Badge variant={m.safe ? 'success' : 'warning'} size="sm">
                {m.safe ? 'آمن' : 'غير آمن'}
              </Badge>
              <Badge variant={m.idempotent ? 'info' : 'neutral'} size="sm">
                {m.idempotent ? 'تكرار آمن' : 'غير قابل للتكرار'}
              </Badge>
            </div>
          </div>
          <p className="mt-2 text-sm font-mono text-gray-500 dark:text-gray-400" dir="ltr">
            {m.example}
          </p>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// 17. CSV TO SQL
// =============================================================================

function csvToSql(csv: string, tableName: string): string {
  const rows = parseCsv(csv);
  if (rows.length < 2) return '';
  const headers = rows[0].map((h) => h.replace(/[^A-Za-z0-9_]/g, '_'));
  const escapeVal = (v: string) => {
    if (v === '') return 'NULL';
    if (/^-?\d+(\.\d+)?$/.test(v)) return v;
    return `'${v.replace(/'/g, "''")}'`;
  };
  const insertRows = rows.slice(1).map((row) => {
    const values = headers.map((_, i) => escapeVal(row[i] ?? '')).join(', ');
    return `INSERT INTO ${tableName} (${headers.join(', ')}) VALUES (${values});`;
  });
  return insertRows.join('\n');
}

function CsvToSql() {
  const { addNotification } = useAppStore();
  const [csv, setCsv] = useState('name,age,city\nAlice,25,Cairo\nBob,30,Alexandria');
  const [tableName, setTableName] = useState('users');
  const [sql, setSql] = useState('');

  const handleGenerate = () => {
    if (!tableName.trim()) {
      addNotification('أدخل اسم الجدول', 'warning');
      return;
    }
    try {
      setSql(csvToSql(csv, tableName.trim().replace(/[^A-Za-z0-9_]/g, '_')));
    } catch {
      setSql('');
      addNotification('إدخال CSV غير صالح', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Input
          label={'اسم الجدول'}
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          className="font-mono"
          dir="ltr"
        />
        <TextArea
          label={'بيانات CSV'}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          className="font-mono"
        />
        <Button onClick={handleGenerate} disabled={!csv.trim()}>
          {'توليد SQL'}
        </Button>
      </Card>
      <ResultBox title={'مخرجات SQL'} value={sql} onClear={() => setSql('')} />
    </div>
  );
}

// =============================================================================
// 18. JSON TO SQL
// =============================================================================

function JsonToSql() {
  const { addNotification } = useAppStore();
  const [json, setJson] = useState('[\n  { "name": "Alice", "age": 25 },\n  { "name": "Bob", "age": 30 }\n]');
  const [tableName, setTableName] = useState('users');
  const [sql, setSql] = useState('');

  const handleGenerate = () => {
    if (!tableName.trim()) {
      addNotification('أدخل اسم الجدول', 'warning');
      return;
    }
    try {
      const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('array');
      const table = tableName.trim().replace(/[^A-Za-z0-9_]/g, '_');
      const headers = Object.keys(parsed[0]);
      const escapeVal = (v: unknown) => {
        if (v === null || v === undefined || v === '') return 'NULL';
        if (typeof v === 'number' && isFinite(v)) return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      };
      const insertRows = parsed.map((row) => {
        const values = headers.map((h) => escapeVal(row[h])).join(', ');
        return `INSERT INTO ${table} (${headers.join(', ')}) VALUES (${values});`;
      });
      setSql(insertRows.join('\n'));
    } catch {
      setSql('');
      addNotification('إدخال JSON غير صالح', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Input
          label={'اسم الجدول'}
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          className="font-mono"
          dir="ltr"
        />
        <TextArea
          label={'بيانات JSON'}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={8}
          className="font-mono"
        />
        <Button onClick={handleGenerate} disabled={!json.trim()}>
          {'توليد SQL'}
        </Button>
      </Card>
      <ResultBox title={'مخرجات SQL'} value={sql} onClear={() => setSql('')} />
    </div>
  );
}

// =============================================================================
// 19-21. CHEAT SHEETS
// =============================================================================

function CheatSheet({ groups }: { groups: { title: string; items: { cmd: string; desc: string }[] }[] }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.title} className="space-y-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{g.title}</h3>
          <div className="space-y-2">
            {g.items.map((item) => (
              <div key={item.cmd} className="rounded-lg bg-gray-50 dark:bg-dark-surface border border-light-border dark:border-dark-border px-3 py-2">
                <p className="font-mono text-sm text-primary-600 dark:text-primary-400" dir="ltr">
                  {item.cmd}
                </p>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

const GIT_CHEATSHEET = [
  {
    title: 'Setup',
    items: [
      { cmd: 'git config --global user.name "Name"', desc: 'تعيين اسم المستخدم العام' },
      { cmd: 'git config --global user.email "email"', desc: 'تعيين البريد الإلكتروني العام' },
      { cmd: 'git init', desc: 'تهيئة مستودع جديد' },
    ],
  },
  {
    title: 'Working with changes',
    items: [
      { cmd: 'git status', desc: 'عرض حالة شجرة العمل' },
      { cmd: 'git add <file>', desc: 'إضافة ملف إلى المرحلة' },
      { cmd: 'git add .', desc: 'إضافة جميع التغييرات' },
      { cmd: 'git commit -m "message"', desc: 'حفظ التغييرات المرحّلة' },
      { cmd: 'git diff', desc: 'عرض التغييرات غير المرحّلة' },
      { cmd: 'git log', desc: 'عرض سجل الحفظ' },
    ],
  },
  {
    title: 'Branches',
    items: [
      { cmd: 'git branch', desc: 'عرض الفروع المحلية' },
      { cmd: 'git branch <name>', desc: 'إنشاء فرع جديد' },
      { cmd: 'git checkout -b <name>', desc: 'إنشاء فرع والانتقال إليه' },
      { cmd: 'git merge <branch>', desc: 'دمج فرع في الفرع الحالي' },
    ],
  },
  {
    title: 'Remote',
    items: [
      { cmd: 'git remote add origin <url>', desc: 'إضافة مستودع بعيد' },
      { cmd: 'git push -u origin main', desc: 'رفع وتحديد الفرع الأساسي' },
      { cmd: 'git pull', desc: 'جلب ودمج التغييرات' },
      { cmd: 'git clone <url>', desc: 'استنساخ مستودع' },
    ],
  },
];

const LINUX_CHEATSHEET = [
  {
    title: 'Navigation',
    items: [
      { cmd: 'ls -la', desc: 'عرض جميع الملفات بالتفاصيل' },
      { cmd: 'cd <dir>', desc: 'تغيير الدليل' },
      { cmd: 'pwd', desc: 'عرض الدليل الحالي' },
      { cmd: 'mkdir <dir>', desc: 'إنشاء دليل' },
      { cmd: 'rm -rf <dir>', desc: 'حذف دليل بالكامل' },
    ],
  },
  {
    title: 'File operations',
    items: [
      { cmd: 'cp <src> <dest>', desc: 'نسخ الملفات' },
      { cmd: 'mv <src> <dest>', desc: 'نقل أو إعادة تسمية الملفات' },
      { cmd: 'cat <file>', desc: 'عرض محتوى الملف' },
      { cmd: 'less <file>', desc: 'عرض الملف صفحة بصفحة' },
      { cmd: 'head / tail <file>', desc: 'عرض بداية أو نهاية الملف' },
      { cmd: 'chmod 755 <file>', desc: 'تغيير صلاحيات الملف' },
    ],
  },
  {
    title: 'System',
    items: [
      { cmd: 'ps aux', desc: 'عرض العمليات الجارية' },
      { cmd: 'top / htop', desc: 'مراقبة موارد النظام' },
      { cmd: 'df -h', desc: 'عرض استخدام القرص' },
      { cmd: 'free -h', desc: 'عرض استخدام الذاكرة' },
      { cmd: 'sudo <cmd>', desc: 'تشغيل أمر بصلاحيات المدير' },
      { cmd: 'grep <pattern> <file>', desc: 'البحث عن نص في الملفات' },
    ],
  },
];

const REGEX_CHEATSHEET = [
  {
    title: 'Anchors',
    items: [
      { cmd: '^', desc: 'بداية السطر' },
      { cmd: '$', desc: 'نهاية السطر' },
      { cmd: '\\b', desc: 'حدود الكلمة' },
    ],
  },
  {
    title: 'Character classes',
    items: [
      { cmd: '\\d', desc: 'أي رقم (0-9)' },
      { cmd: '\\w', desc: 'حرف كلمة' },
      { cmd: '\\s', desc: 'مسافة بيضاء' },
      { cmd: '.', desc: 'أي حرف' },
      { cmd: '[abc]', desc: 'أي من الأحرف a أو b أو c' },
    ],
  },
  {
    title: 'Quantifiers',
    items: [
      { cmd: '*', desc: 'صفر أو أكثر' },
      { cmd: '+', desc: 'واحد أو أكثر' },
      { cmd: '?', desc: 'صفر أو واحد' },
      { cmd: '{n}', desc: 'n مرة بالضبط' },
      { cmd: '{n,m}', desc: 'بين n وm مرة' },
    ],
  },
  {
    title: 'Groups & alternation',
    items: [
      { cmd: '(abc)', desc: 'مجموعة التقاط' },
      { cmd: '(?:abc)', desc: 'مجموعة بدون التقاط' },
      { cmd: 'a|b', desc: 'بديل (a أو b)' },
      { cmd: '\\1', desc: 'مرجع خلفي' },
    ],
  },
];

const HTML_ENTITIES: { entity: string; char: string; name: string }[] = [
  { entity: '&amp;', char: '&', name: 'Ampersand' },
  { entity: '&lt;', char: '<', name: 'Less than' },
  { entity: '&gt;', char: '>', name: 'Greater than' },
  { entity: '&quot;', char: '"', name: 'Double quote' },
  { entity: '&#39;', char: "'", name: 'Single quote' },
  { entity: '&nbsp;', char: '\u00A0', name: 'Non-breaking space' },
  { entity: '&copy;', char: '\u00A9', name: 'Copyright' },
  { entity: '&reg;', char: '\u00AE', name: 'Registered trademark' },
  { entity: '&trade;', char: '\u2122', name: 'Trademark' },
  { entity: '&euro;', char: '\u20AC', name: 'Euro' },
  { entity: '&pound;', char: '\u00A3', name: 'Pound' },
  { entity: '&yen;', char: '\u00A5', name: 'Yen' },
  { entity: '&cent;', char: '\u00A2', name: 'Cent' },
  { entity: '&mdash;', char: '\u2014', name: 'Em dash' },
  { entity: '&ndash;', char: '\u2013', name: 'En dash' },
  { entity: '&hellip;', char: '\u2026', name: 'Ellipsis' },
  { entity: '&apos;', char: "'", name: 'Apostrophe' },
];

// =============================================================================
// 22. ASCII TABLE
// =============================================================================

function AsciiTable() {
  const rows = Array.from({ length: 128 }, (_, i) => i);

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm" dir="ltr">
        <thead>
          <tr className="border-b border-light-border dark:border-dark-border">
            <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">{'عشري'}</th>
            <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Hex</th>
            <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">{'ثنائي'}</th>
            <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">{'الحرف'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i} className="border-b border-light-border/50 dark:border-dark-border/50">
              <td className="py-1.5 px-3 font-mono text-gray-600 dark:text-gray-400">{i}</td>
              <td className="py-1.5 px-3 font-mono text-gray-600 dark:text-gray-400">{i.toString(16).toUpperCase().padStart(2, '0')}</td>
              <td className="py-1.5 px-3 font-mono text-gray-600 dark:text-gray-400">{i.toString(2).padStart(8, '0')}</td>
              <td className="py-1.5 px-3 font-mono text-gray-800 dark:text-gray-200">
                {i >= 32 && i <= 126 ? String.fromCharCode(i) : <span className="text-gray-400 dark:text-gray-600">·</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// =============================================================================
// 23. UNIX TIMESTAMP
// =============================================================================

function UnixTimestamp() {
  const [timestamp, setTimestamp] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [dateString, setDateString] = useState(() => new Date().toISOString().slice(0, 16));
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [convertedDate, setConvertedDate] = useState('');

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTimestampToDate = () => {
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return;
    setConvertedDate(new Date(ts * 1000).toLocaleString('ar-SA-u-nu-latn'));
  };

  const handleDateToTimestamp = () => {
    const ts = Math.floor(new Date(dateString).getTime() / 1000);
    if (isNaN(ts)) return;
    setTimestamp(String(ts));
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-500/20 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{'طابع Unix الزمني الحالي'}</p>
          <p className="font-mono text-2xl font-bold text-primary-600 dark:text-primary-400" dir="ltr">
            {now}
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Input
              label={'الطابع الزمني (ثوانٍ)'}
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              className="font-mono"
              dir="ltr"
              wrapperClassName="flex-1"
            />
            <Button onClick={handleTimestampToDate}>{'إلى تاريخ'}</Button>
          </div>
          {convertedDate && (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{convertedDate}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Input
              label={'التاريخ والوقت'}
              type="datetime-local"
              value={dateString}
              onChange={(e) => setDateString(e.target.value)}
              wrapperClassName="flex-1"
            />
            <Button onClick={handleDateToTimestamp}>{'إلى طابع زمني'}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// 24. QR CODE GENERATOR
// =============================================================================

function QrGeneratorTool() {
  const { addNotification } = useAppStore();
  const [text, setText] = useState('https://morven.online');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      addNotification('الرجاء إدخال المحتوى', 'warning');
      return;
    }
    setGenerating(true);
    try {
      const dataUrl = await QRCode.toDataURL(text.trim(), { width: 320, margin: 2, errorCorrectionLevel: 'M' });
      setQrDataUrl(dataUrl);
    } catch {
      addNotification('خطأ في توليد رمز QR', 'error');
    } finally {
      setGenerating(false);
    }
  }, [text, addNotification]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'qr-code.png';
    a.click();
    fetch(qrDataUrl).then(r => r.blob()).then(blob => {
      saveToLibrary(blob, 'qr-code.png', 'engineering-tools', 'image/png').catch(() => {});
    }).catch(() => {});
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'نص أو رابط'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <Button onClick={handleGenerate} loading={generating} disabled={!text.trim()}>
          {'توليد رمز QR'}
        </Button>
      </Card>
      {qrDataUrl && (
        <Card className="space-y-4 items-center text-center">
          <FieldLabel>{'رمز QR'}</FieldLabel>
          <img src={qrDataUrl} alt="QR Code" className="mx-auto w-56 h-56 rounded-xl" />
          <Button variant="secondary" onClick={handleDownload}>
            {'تنزيل PNG'}
          </Button>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 25. LOREM IPSUM
// =============================================================================

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum',
];

function LoremIpsum() {
  const [paragraphs, setParagraphs] = useState(3);
  const [wordsPer, setWordsPer] = useState(30);
  const [output, setOutput] = useState('');

  const handleGenerate = () => {
    const sentences: string[] = [];
    for (let p = 0; p < paragraphs; p++) {
      const sentenceCount = Math.max(3, Math.round(wordsPer / 9));
      const para: string[] = [];
      for (let s = 0; s < sentenceCount; s++) {
        const count = Math.max(5, Math.round(wordsPer / sentenceCount));
        const words: string[] = [];
        for (let w = 0; w < count; w++) {
          words.push(LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)]);
        }
        para.push(words.join(' ') + '.');
      }
      sentences.push(para.join(' '));
    }
    setOutput(sentences.join('\n\n'));
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={'الفقرات'}
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={String(paragraphs)}
            onChange={(e) => setParagraphs(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
          />
          <Input
            label={'الكلمات لكل فقرة'}
            type="number"
            inputMode="numeric"
            min={5}
            max={200}
            value={String(wordsPer)}
            onChange={(e) => setWordsPer(Math.max(5, Math.min(200, parseInt(e.target.value) || 5)))}
          />
        </div>
        <Button onClick={handleGenerate}>{'توليد نص'}</Button>
      </Card>
      <ResultBox title={'Lorem Ipsum'} value={output} onClear={() => setOutput('')} />
    </div>
  );
}

// =============================================================================
// 26. RANDOM DATA
// =============================================================================

const FIRST_NAMES = ['Ahmad', 'Mona', 'Yousef', 'Sara', 'Omar', 'Layla', 'Khalid', 'Nour', 'Adam', 'Huda', 'Ibrahim', 'Rana', 'Tariq', 'Dina', 'Samir', 'Aya', 'Fadi', 'Reem', 'Ziad', 'Hana'];
const LAST_NAMES = ['Hassan', 'Ali', 'Saeed', 'Nasser', 'Khalil', 'Salem', 'Othman', 'Nabil', 'Rashid', 'Farid', 'Sabri', 'Mansour', 'Zaki', 'Barakat', 'Shaheen', 'Awad', 'Dagher', 'Rizk', 'Toma', 'Nakhle'];
const CITIES = ['Cairo', 'Alexandria', 'Riyadh', 'Dubai', 'Beirut', 'Amman', 'Damascus', 'Baghdad', 'Tunis', 'Casablanca', 'Kuwait City', 'Doha'];
const WORDS = ['student', 'engineer', 'doctor', 'teacher', 'designer', 'developer', 'analyst', 'manager', 'researcher', 'writer', 'artist', 'nurse', 'accountant', 'architect'];

function RandomData() {
  const [type, setType] = useState<'names' | 'emails' | 'phones' | 'numbers' | 'words'>('names');
  const [count, setCount] = useState(5);
  const [output, setOutput] = useState('');

  const handleGenerate = () => {
    const rows: string[] = [];
    for (let i = 0; i < count; i++) {
      const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const city = CITIES[Math.floor(Math.random() * CITIES.length)];
      switch (type) {
        case 'names':
          rows.push(`${first} ${last}`);
          break;
        case 'emails':
          rows.push(`${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(Math.random() * 100)}@example.com`);
          break;
        case 'phones':
          rows.push(`+20 10${Math.floor(10000000 + Math.random() * 90000000)}`);
          break;
        case 'numbers':
          rows.push(String(Math.floor(Math.random() * 1000000)));
          break;
        case 'words':
          rows.push(`${WORDS[Math.floor(Math.random() * WORDS.length)]} ${first} ${city}`);
          break;
      }
    }
    setOutput(rows.join('\n'));
  };

  const typeOptions = [
    { value: 'names', label: 'الأسماء' },
    { value: 'emails', label: 'البريد الإلكتروني' },
    { value: 'phones', label: 'أرقام الهاتف' },
    { value: 'numbers', label: 'أرقام' },
    { value: 'words', label: 'الكلمات والجمل' },
  ];

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={'نوع البيانات'}
            options={typeOptions}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          />
          <Input
            label={'العدد'}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={String(count)}
            onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
          />
        </div>
        <Button onClick={handleGenerate}>{'توليد'}</Button>
      </Card>
      <ResultBox title={'البيانات المولدة'} value={output} onClear={() => setOutput('')} />
    </div>
  );
}

// =============================================================================
// 27. PASSWORD STRENGTH
// =============================================================================

function PasswordStrength() {
  const [password, setPassword] = useState('');

  const analyze = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const score = analyze(password);
  const percent = (score / 5) * 100;
  const labels = ['ضعيفة جداً', 'ضعيفة', 'مقبول', 'جيد', 'قوية'];
  const label = password ? labels[Math.max(0, score - 1)] : '';
  const color =
    score <= 1 ? 'bg-red-500' : score <= 2 ? 'bg-orange-500' : score <= 3 ? 'bg-amber-500' : score <= 4 ? 'bg-emerald-500' : 'bg-green-600';

  const suggestions = (() => {
    const list: string[] = [];
    if (password.length < 12) list.push('استخدم 12 حرفاً على الأقل');
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) list.push('امزج الأحرف الكبيرة والصغيرة');
    if (!/\d/.test(password)) list.push('أضف أرقاماً');
    if (!/[^A-Za-z0-9]/.test(password)) list.push('أضف رموزاً خاصة');
    return list;
  })();

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <Input
          label={'كلمة المرور'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={'اكتب كلمة مرور لتحليلها'}
        />
        {password && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{'القوة'}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-dark-border overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            {suggestions.length > 0 && (
              <ul className="space-y-1">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="text-amber-500">⚠</span> {s}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// =============================================================================
// 28. HASH VERIFIER
// =============================================================================

function HashVerifier() {
  const [text, setText] = useState('');
  const [expected, setExpected] = useState('');
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [status, setStatus] = useState<'idle' | 'match' | 'no-match'>('idle');
  const [actual, setActual] = useState('');

  const handleVerify = async () => {
    try {
      const data = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest(algorithm, data);
      const hash = toHex(buf);
      setActual(hash);
      setStatus(hash.toLowerCase() === expected.trim().toLowerCase() ? 'match' : 'no-match');
    } catch {
      setStatus('idle');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'النص المدخل'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={'البصمة المتوقعة'}
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className="font-mono"
            dir="ltr"
            placeholder="e3b0c44298fc..."
          />
          <Select
            label={'الخوارزمية'}
            options={[
              { value: 'SHA-1', label: 'SHA-1' },
              { value: 'SHA-256', label: 'SHA-256' },
              { value: 'SHA-384', label: 'SHA-384' },
              { value: 'SHA-512', label: 'SHA-512' },
            ]}
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
          />
        </div>
        <Button onClick={handleVerify} disabled={!text.trim() || !expected.trim()}>
          {'تحقق'}
        </Button>
      </Card>
      {status !== 'idle' && (
        <Card
          className={`border-2 ${
            status === 'match'
              ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/10'
              : 'border-red-500/40 bg-red-50 dark:bg-red-900/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{status === 'match' ? '✅' : '❌'}</span>
            <div className="flex-1">
              <p className={`font-semibold ${status === 'match' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {status === 'match'
                  ? ('التجزئة متطابقة!')
                  : ('التجزئة غير متطابقة')}
              </p>
              {actual && (
                <p className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 break-all" dir="ltr">
                  {actual}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// 29. HMAC GENERATOR
// =============================================================================

function HmacGenerator() {
  const { addNotification } = useAppStore();
  const [text, setText] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [output, setOutput] = useState('');

  const handleGenerate = async () => {
    if (!text.trim() || !secret.trim()) {
      addNotification('أدخل النص والمفتاح السري معاً', 'warning');
      return;
    }
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: algorithm },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
      setOutput(toHex(sig));
    } catch {
      setOutput('');
      addNotification('خطأ في توليد HMAC', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <TextArea
          label={'النص المدخل'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={'المفتاح السري'}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            dir="ltr"
          />
          <Select
            label={'الخوارزمية'}
            options={[
              { value: 'SHA-1', label: 'SHA-1' },
              { value: 'SHA-256', label: 'SHA-256' },
              { value: 'SHA-384', label: 'SHA-384' },
              { value: 'SHA-512', label: 'SHA-512' },
            ]}
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
          />
        </div>
        <Button onClick={handleGenerate}>{'توليد HMAC'}</Button>
      </Card>
      <ResultBox title="HMAC" value={output} onClear={() => setOutput('')} />
    </div>
  );
}

// =============================================================================
// Coming soon placeholder
// =============================================================================

function ComingSoonTool() {
  return (
    <Card className="text-center py-16">
      <div className="text-5xl mb-4">🔧</div>
      <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
        {'قريباً'}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {'هذه الأداة الهندسية قيد التطوير.'}
      </p>
    </Card>
  );
}

// =============================================================================
// Main page
// =============================================================================

interface EngineeringToolPageProps {
  toolId: string;
}

export default function EngineeringToolPage({ toolId }: EngineeringToolPageProps) {
  const tool = getToolById(toolId);
  const location = useLocation();
  const sub = (location.state as { sub?: string; subName?: string } | null)?.sub;
  const subName = (location.state as { sub?: string; subName?: string } | null)?.subName;

  const backLabel = subName
    ? `العودة لأدوات ${subName}`
    : 'العودة لأدوات الهندسية';

  let content: React.ReactNode;

  switch (toolId) {
    case 'json-formatter':
      content = <JsonFormatter />;
      break;
    case 'json-validator':
      content = <JsonValidator />;
      break;
    case 'regex-tester':
      content = <RegexTester />;
      break;
    case 'uuid-generator':
      content = <UuidGenerator />;
      break;
    case 'base64-encoder':
      content = <Base64Tool />;
      break;
    case 'hash-generator':
      content = <HashGenerator />;
      break;
    case 'password-generator':
      content = <PasswordGeneratorTool />;
      break;
    case 'html-preview':
      content = <HtmlPreview />;
      break;
    case 'svg-viewer':
      content = <SvgViewer />;
      break;
    case 'color-picker':
      content = <ColorPicker />;
      break;
    case 'gradient-generator':
      content = <GradientGenerator />;
      break;
    case 'css-beautifier':
      content = <CssBeautifier />;
      break;
    case 'css-minifier':
      content = <CssMinifier />;
      break;
    case 'js-beautifier':
      content = <JsBeautifier />;
      break;
    case 'js-minifier':
      content = <JsMinifier />;
      break;
    case 'csv-json':
      content = <CsvJson />;
      break;
    case 'markdown-html':
      content = <MarkdownToHtml />;
      break;
    case 'url-encoder':
      content = <UrlEncoder />;
      break;
    case 'http-status-codes':
      content = <HttpStatusCodes />;
      break;
    case 'rest-methods':
      content = <RestMethods />;
      break;
    case 'csv-to-sql':
      content = <CsvToSql />;
      break;
    case 'json-to-sql':
      content = <JsonToSql />;
      break;
    case 'git-cheatsheet':
      content = <CheatSheet groups={GIT_CHEATSHEET} />;
      break;
    case 'linux-commands':
      content = <CheatSheet groups={LINUX_CHEATSHEET} />;
      break;
    case 'regex-cheatsheet':
      content = <CheatSheet groups={REGEX_CHEATSHEET} />;
      break;
    case 'html-entities':
      content = (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm" dir="ltr">
            <thead>
              <tr className="border-b border-light-border dark:border-dark-border">
                <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Entity</th>
                <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">{'الحرف'}</th>
                <th className="text-start py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">{'الاسم'}</th>
              </tr>
            </thead>
            <tbody>
              {HTML_ENTITIES.map((e) => (
                <tr key={e.entity} className="border-b border-light-border/50 dark:border-dark-border/50">
                  <td className="py-1.5 px-3 font-mono text-primary-600 dark:text-primary-400">{e.entity}</td>
                  <td className="py-1.5 px-3 font-mono text-gray-800 dark:text-gray-200">{e.char}</td>
                  <td className="py-1.5 px-3 text-gray-600 dark:text-gray-400">{e.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      );
      break;
    case 'ascii-table':
      content = <AsciiTable />;
      break;
    case 'unix-timestamp':
      content = <UnixTimestamp />;
      break;
    case 'qr-generator-eng':
      content = <QrGeneratorTool />;
      break;
    case 'lorem-ipsum':
      content = <LoremIpsum />;
      break;
    case 'random-data':
      content = <RandomData />;
      break;
    case 'password-strength':
      content = <PasswordStrength />;
      break;
    case 'hash-verifier':
      content = <HashVerifier />;
      break;
    case 'hmac-generator':
      content = <HmacGenerator />;
      break;
    default:
      content = <ComingSoonTool />;
      break;
  }

  return (
    <ToolLayout
      backTo="/category/engineering"
      backLabel={backLabel}
      backState={sub ? { sub } : undefined}
    >
      {tool && (
        <ToolHero
          icon={<tool.icon className="w-8 h-8 text-primary-600 dark:text-primary-400" />}
          title={tool.name}
          description={tool.description}
        />
      )}
      {content}
    </ToolLayout>
  );
}
