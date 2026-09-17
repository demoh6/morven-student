import type { ToolCategory } from '@/types';
import type { LucideIcon } from "lucide-react";

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  comingSoon?: boolean;
}

export interface CategoryMeta {
  name: string;
  icon: LucideIcon;

}

import {
  FileText, FileImage, Presentation, Video, Mic, ImageIcon, QrCode,
  GraduationCap, HeartPulse, File, FileSpreadsheet, Paperclip, Scissors,
  Minimize2, Trash2, Shuffle, RotateCw, Lock, Unlock, Droplet, PenTool,
  Search, Printer, ArrowLeftRight, FileSearch, ClipboardList,
  Music, Lightbulb, Pen, CheckCircle, Globe, List, Newspaper, Key,
  HelpCircle, Sparkles, Smartphone, Timer,
  ListTodo, Calendar, ClipboardPlus, FileArchive, ArrowUpDown, Droplets, Signature, ScanSearch, ScanText, GitCompare, Stethoscope, Scale, Pill, FlaskConical, FileHeart,
  Cog, Combine, Archive, Hash, NotebookPen,
  Braces, Regex, KeyRound, Fingerprint, Palette, Code2, FileCode2, Wand2, Table,
  FileCode, Link, Server, Gauge, Route, Database, Box, Boxes, Table2, Grid3x3,
  GitBranch, Terminal, Cloud, AtSign, Columns, Clock, Barcode, Quote, ListChecks,
  CalendarClock, ShieldCheck, BadgeCheck, LockKeyhole, Shield, Book, BookOpenCheck, Type,
  Eraser, Maximize2, Crop, SlidersHorizontal, EyeOff, Stamp, Info, AudioLines, WandSparkles, ScanLine, Camera,
  BookHeart
} from "lucide-react";

export const icon = {
  FileText, FileImage, Presentation, Video, Mic, ImageIcon, QrCode,
  GraduationCap, HeartPulse, File, FileSpreadsheet, Paperclip, Scissors,
  Minimize2, Trash2, Shuffle, RotateCw, Lock, Unlock, Droplet, PenTool,
  Search, Printer, ArrowLeftRight, FileSearch, ClipboardList,
  Music, Lightbulb, Pen, CheckCircle, Globe, List, Newspaper, Key,
  HelpCircle, Sparkles, Smartphone, Timer, 
  ListTodo, Calendar, ClipboardPlus, FileArchive, ArrowUpDown, Droplets, Signature, ScanSearch, ScanText, GitCompare, Stethoscope, Scale, Pill, FlaskConical, FileHeart,
  Cog, Combine, Archive, Hash, NotebookPen, Book, BookOpenCheck, Type,
  Eraser, Maximize2, Crop, SlidersHorizontal, EyeOff, Stamp, Info, AudioLines, WandSparkles, ScanLine, Camera, BookHeart
}

export const tools: Tool[] = [
  // GENERAL
  { id: 'holy-quran', name: 'القرآن الكريم', description: 'خيرُ ما تُستفتح به دراستك هو كلامُ الله؛ فهو سكينةٌ للروح، وبركةٌ في العلم، وعونٌ على التركيز.', icon: Book, category: 'general' },
  { id: 'adhkar', name: 'الأذكار', description: 'أذكار الصباح والمساء وأذكار مناسبة للدراسة والامتحانات مع عدّادات للتتبع', icon: BookHeart, category: 'general' },
  { id: 'task-manager', name: 'مدير المهام', description: 'تنظيم وتتبع مهام دراستك', icon: ListTodo, category: 'general' },
  { id: 'notes', name: 'الملاحظات', description: 'أنشئ واحفظ ملاحظاتك بسرعة مع حفظ تلقائي', icon: NotebookPen, category: 'general' },
  { id: 'pomodoro-timer', name: 'مؤقت بومودورو', description: 'تعزيز الإنتاجية بجلسات دراسة محددة الوقت', icon: Timer, category: 'general' },
  { id: 'exam-countdown', name: 'عد تنازلي للامتحان', description: 'تتبع الأيام المتبقية حتى امتحاناتك', icon: Calendar, category: 'general' },
  { id: 'cv-builder', name: 'منشئ السيرة الذاتية', description: 'أنشئ سيرة ذاتية احترافية بتصميمات متعددة وتصديرها كملف PDF', icon: FileText, category: 'general' },

  // MEDICAL
  { id: 'disease-explain', name: 'شرح الأمراض', description: 'الحصول على شروحات بسيطة للأمراض والحالات', icon: Stethoscope, category: 'medical' },
  { id: 'drug-summary', name: 'مرجع الأدوية', description: 'وصول سريع لمعلومات الأدوية والتفاعلات', icon: Pill, category: 'medical' },
  { id: 'lab-values', name: 'قيم المختبر', description: 'مرجع للقيم المختبرية الطبيعية ونطاقاتها', icon: FlaskConical, category: 'medical' },
  { id: 'medical-notes', name: 'ملاحظات طبية', description: 'تدوين الملاحظات السريرية بالقوالب', icon: ClipboardPlus, comingSoon: true, category: 'medical' },
  { id: 'medical-flashcards', name: 'بطاقات طبية', description: 'بطاقات دراسية طبية جاهزة', icon: BookOpenCheck, comingSoon: true, category: 'medical' },
  { id: 'medical-mcq', name: 'أسئلة طبية اختيار من متعدد', description: 'إنشاء أسئلة اختيار من متعدد طبية', icon: HelpCircle, comingSoon: true, category: 'medical' },

  // ENGINEERING
  // Code Tools
  { id: 'json-formatter', name: 'منسق JSON', description: 'تنسيق والتحقق من بيانات JSON وتجميلها', icon: Braces, category: 'engineering' },
  { id: 'json-validator', name: 'مدقق JSON', description: 'التحقق من بيانات JSON مع تقارير أخطاء مفصلة', icon: CheckCircle, category: 'engineering' },
  { id: 'password-generator', name: 'مولد كلمات المرور', description: 'توليد كلمات مرور قوية عشوائية', icon: Lock, category: 'engineering' },
  // Web Development
  { id: 'html-preview', name: 'معاينة HTML', description: 'اكتب HTML وشاهد المعاينة فوراً', icon: Globe, category: 'engineering' },
  { id: 'css-beautifier', name: 'منسق CSS', description: 'تنسيق وتجميل أكواد CSS', icon: Palette, category: 'engineering' },
  { id: 'css-minifier', name: 'مصغّر CSS', description: 'تصغير CSS لتقليل حجم الملف', icon: Minimize2, category: 'engineering' },
  { id: 'js-beautifier', name: 'منسق JavaScript', description: 'تنسيق وتجميل أكواد JavaScript', icon: Code2, category: 'engineering' },
  { id: 'js-minifier', name: 'مصغّر JavaScript', description: 'تصغير JavaScript لتقليل حجم الملف', icon: FileCode2, category: 'engineering' },
  { id: 'svg-viewer', name: 'عارض SVG', description: 'اكتب SVG وشاهد المعاينة مباشرة', icon: PenTool, category: 'engineering' },
  { id: 'color-picker', name: 'منتقي الألوان', description: 'اختر الألوان واحصل على قيم HEX وRGB وHSL', icon: Wand2, category: 'engineering' },
  { id: 'gradient-generator', name: 'مولد التدرجات', description: 'إنشاء تدرجات CSS جميلة', icon: Sparkles, category: 'engineering' },
  // Data Conversion
  { id: 'json-yaml', name: 'JSON إلى YAML', description: 'التحويل بين صيغتي JSON وYAML', icon: Shuffle, comingSoon: true, category: 'engineering' },
  { id: 'json-xml', name: 'JSON إلى XML', description: 'التحويل بين صيغتي JSON وXML', icon: ArrowLeftRight, comingSoon: true, category: 'engineering' },
  { id: 'csv-json', name: 'CSV إلى JSON', description: 'تحويل بيانات CSV إلى JSON والعكس', icon: Table, category: 'engineering' },
  { id: 'markdown-html', name: 'Markdown إلى HTML', description: 'تحويل نص Markdown إلى HTML', icon: FileText, category: 'engineering' },
  { id: 'html-markdown', name: 'HTML إلى Markdown', description: 'تحويل HTML إلى نص Markdown', icon: FileCode, comingSoon: true, category: 'engineering' },
  { id: 'url-encoder', name: 'ترميز URL', description: 'ترميز وفك ترميز روابط URL', icon: Link, category: 'engineering' },
  // API & Networking
  { id: 'api-tester', name: 'اختبار API', description: 'اختبار واجهات برمجة التطبيقات HTTP بطلبات مخصصة', icon: Server, comingSoon: true, category: 'engineering' },
  { id: 'http-status-codes', name: 'أكواد حالة HTTP', description: 'مرجع لأكواد حالة HTTP', icon: Gauge, category: 'engineering' },
  { id: 'http-headers', name: 'ترويسات HTTP', description: 'مرجع لترويسات HTTP الشائعة', icon: ClipboardList, comingSoon: true, category: 'engineering' },
  { id: 'mime-types', name: 'أنواع MIME', description: 'مرجع لأنواع MIME الشائعة', icon: Type, comingSoon: true, category: 'engineering' },
  { id: 'rest-methods', name: 'طرق REST', description: 'مرجع لطرق HTTP REST', icon: Route, category: 'engineering' },
  // Database
  { id: 'sql-formatter', name: 'منسق SQL', description: 'تنسيق استعلامات SQL للقراءة', icon: Database, comingSoon: true, category: 'engineering' },
  { id: 'sql-beautifier', name: 'مجمل SQL', description: 'تجميل ومحاذاة جمل SQL', icon: Box, comingSoon: true, category: 'engineering' },
  { id: 'sql-playground', name: 'بيئة SQL التجريبية', description: 'جرّب استعلامات SQL', icon: Boxes, comingSoon: true, category: 'engineering' },
  { id: 'csv-to-sql', name: 'CSV إلى SQL', description: 'توليد جمل إدراج SQL من CSV', icon: Table2, category: 'engineering' },
  { id: 'json-to-sql', name: 'JSON إلى SQL', description: 'توليد جمل إدراج SQL من JSON', icon: Grid3x3, category: 'engineering' },
  // Developer Reference
  { id: 'git-cheatsheet', name: 'ورقة غش Git', description: 'مرجع سريع لأوامر Git الشائعة', icon: GitBranch, category: 'engineering' },
  { id: 'linux-commands', name: 'أوامر Linux', description: 'مرجع سريع لأوامر Linux الشائعة', icon: Terminal, category: 'engineering' },
  { id: 'regex-cheatsheet', name: 'ورقة غش التعبيرات النمطية', description: 'مرجع سريع لصيغ التعبيرات النمطية', icon: Search, category: 'engineering' },
  { id: 'http-cheatsheet', name: 'ورقة غش HTTP', description: 'مرجع سريع لأساسيات HTTP', icon: Cloud, comingSoon: true, category: 'engineering' },
  { id: 'html-entities', name: 'كيانات HTML', description: 'مرجع لكيانات HTML الشائعة', icon: AtSign, category: 'engineering' },
  { id: 'ascii-table', name: 'جدول ASCII', description: 'جدول مرجعي كامل لأحرف ASCII', icon: Columns, category: 'engineering' },
  // Developer Utilities
  { id: 'unix-timestamp', name: 'طابع Unix الزمني', description: 'تحويل طوابع Unix الزمنية إلى تواريخ مقروءة', icon: Clock, category: 'engineering' },
  { id: 'qr-generator-eng', name: 'مولد رموز QR', description: 'إنشاء رموز QR من النصوص والروابط', icon: QrCode, category: 'engineering' },
  { id: 'barcode-generator', name: 'مولد الباركود', description: 'إنشاء باركود من البيانات الرقمية', icon: Barcode, comingSoon: true, category: 'engineering' },
  { id: 'lorem-ipsum', name: 'مولّد لوريم إيبسوم', description: 'توليد نص لوريم إيبسوم تجريبي', icon: Quote, category: 'engineering' },
  { id: 'random-data', name: 'مولّد بيانات عشوائية', description: 'توليد بيانات اختبار عشوائية بأنواع متعددة', icon: ListChecks, category: 'engineering' },
  { id: 'cron-builder', name: 'منشئ Cron', description: 'إنشاء تعبيرات cron بصرياً', icon: CalendarClock, comingSoon: true, category: 'engineering' },
  // Security
  { id: 'password-strength', name: 'قوة كلمة المرور', description: 'تحليل قوة وأمان كلمات المرور', icon: ShieldCheck, category: 'engineering' },
  { id: 'hash-verifier', name: 'مدقق التجزئة', description: 'التحقق من نص مقابل تجزئة معينة', icon: BadgeCheck, category: 'engineering' },
  { id: 'hmac-generator', name: 'مولد HMAC', description: 'توليد توقيعات HMAC بمفاتيح سرية', icon: LockKeyhole, category: 'engineering' },
  { id: 'jwt-inspector', name: 'فاحص JWT', description: 'فحص بنية رموز JWT ومحتواها', icon: Shield, comingSoon: true, category: 'engineering' },
  { id: 'token-decoder', name: 'مفكك الرموز', description: 'فك ترميز صيغ الرموز المختلفة', icon: Key, comingSoon: true, category: 'engineering' },

  // PDF
  { id: 'word-to-pdf', name: 'Word إلى PDF', description: 'تحويل مستندات Word إلى صيغة PDF', icon: FileText, category: 'pdf' },
  { id: 'excel-to-pdf', name: 'Excel إلى PDF', description: 'تحويل جداول Excel إلى PDF', icon: FileSpreadsheet, category: 'pdf' },
  { id: 'ppt-to-pdf', name: 'PPT إلى PDF', description: 'تحويل عروض PowerPoint إلى PDF', icon: Presentation, category: 'pdf' },
  { id: 'merge-pdfs', name: 'دمج PDF', description: 'دمج ملفات PDF متعددة في مستند واحد', icon: Paperclip, category: 'pdf' },
  { id: 'split-pdf', name: 'تقسيم PDF', description: 'تقسيم ملف PDF إلى صفحات أو نطاقات منفصلة', icon: Scissors, category: 'pdf' },
  { id: 'compress-pdf', name: 'ضغط PDF', description: 'تقليل حجم ملف PDF دون فقدان الجودة', icon: FileArchive, category: 'pdf' },
  { id: 'delete-pages', name: 'حذف صفحات', description: 'إزالة الصفحات غير المرغوب فيها من مستند PDF', icon: Trash2, category: 'pdf' },
  { id: 'reorder-pages', name: 'إعادة ترتيب الصفحات', description: 'إعادة ترتيب الصفحات في مستند PDF', icon: ArrowUpDown, category: 'pdf' },
  { id: 'rotate-pages', name: 'تدوير الصفحات', description: 'تدوير صفحات فردية في PDF', icon: RotateCw, category: 'pdf' },
  { id: 'password-protect', name: 'حماية بكلمة مرور', description: 'إضافة حماية بكلمة مرور لملفات PDF', icon: Lock, category: 'pdf' },

  // POWERPOINT
  { id: 'generate-ppt-text', name: 'إنشاء PPT من نص', description: 'إنشاء عرض تقديمي من محتوى نصي', icon: Presentation, category: 'powerpoint' },
  { id: 'generate-ppt-pdf', name: 'إنشاء PPT من PDF', description: 'تحويل PDF إلى عرض PowerPoint', icon: FileText, category: 'powerpoint' },
  { id: 'merge-ppt', name: 'دمج عروض PowerPoint', description: 'دمج عدة عروض PowerPoint في عرض واحد', icon: Combine, category: 'powerpoint' },
  { id: 'split-ppt', name: 'تقسيم عرض PowerPoint', description: 'تقسيم عرض PowerPoint إلى عدة ملفات', icon: Scissors, category: 'powerpoint' },
  { id: 'compress-ppt', name: 'ضغط PowerPoint', description: 'تقليل حجم عرض PowerPoint', icon: Archive, category: 'powerpoint' },
  
  // VIDEO
  { id: 'edit-video', name: 'تحرير الفيديو', description: 'تغيير حجم الفيديو وتدويره أو قلبه في أداة واحدة.', icon: PenTool, category: 'video' },
  { id: 'cut-video', name: 'قص الفيديو', description: 'اقتطاع المقطع المطلوب من الفيديو.', icon: Scissors, category: 'video' },
  { id: 'merge-videos', name: 'دمج الفيديوهات', description: 'دمج عدة مقاطع فيديو في فيديو واحد بالترتيب الذي تختاره.', icon: Combine, category: 'video' },
  { id: 'change-video-speed', name: 'تغيير سرعة الفيديو', description: 'تسريع الفيديو أو إبطاؤه مع الحفاظ على تزامن الصوت.', icon: Gauge, category: 'video' },
  { id: 'compress-video', name: 'ضغط الفيديو', description: 'تقليل حجم ملف الفيديو.', icon: Minimize2, category: 'video' },
  { id: 'edit-video-audio', name: 'تحرير صوت الفيديو', description: 'إزالة صوت الفيديو أو استبداله بملف صوتي آخر مع ضبط مستوى الصوت.', icon: Mic, category: 'video' },
  { id: 'extract-audio-video', name: 'استخراج الصوت من فيديو', description: 'استخراج المسار الصوتي من ملفات الفيديو بصيغة MP3.', icon: Music, category: 'video' },
  { id: 'remove-music', name: 'إزالة الموسيقى من الفيديو', description: 'فصل الكلام/الصوت البشري عن الموسيقى وإزالة الخلفية الموسيقية مع الحفاظ على الصوت قدر الإمكان.', icon: AudioLines, category: 'video' },
  { id: 'video-to-gif', name: 'تحويل الفيديو إلى GIF', description: 'إنشاء GIF متحركة من مقطع فيديو بإعدادات مرنة.', icon: ImageIcon, category: 'video' },
   
  // IMAGES
  { id: 'crop-image', name: 'قص الصورة', description: 'قص الجزء الذي تريده من الصورة بسهولة', icon: Crop, category: 'images' },
  { id: 'resize-image', name: 'تغيير حجم الصورة', description: 'تغيير أبعاد الصورة مع الحفاظ على تناسبها', icon: Maximize2, category: 'images' },
  { id: 'rotate-image', name: 'تدوير وقلب الصورة', description: 'تدوير الصورة أو قلبها أفقياً وعمودياً', icon: RotateCw, category: 'images' },
  { id: 'adjust-image', name: 'تعديل الصورة', description: 'تحسين الإضاءة والألوان ومظهر الصورة', icon: SlidersHorizontal, category: 'images' },
  { id: 'blur-image', name: 'طمس وإخفاء أجزاء من الصورة', description: 'طمس أو إخفاء أجزاء محددة من الصورة لحماية الخصوصية', icon: EyeOff, category: 'images' },

  // AUDIO
  { id: 'speech-to-text', name: 'تحويل الكلام إلى نص', description: 'حوّل التسجيلات الصوتية إلى نص مكتوب باستخدام Whisper.', icon: Mic, category: 'audio' },
  { id: 'cut-audio', name: 'قص الصوت', description: 'اقتطاع مقطع محدد من ملف صوتي.', icon: Scissors, category: 'audio' },
  { id: 'merge-audio', name: 'دمج الملفات الصوتية', description: 'دمج عدة ملفات صوتية في ملف واحد بالترتيب المحدد.', icon: Combine, category: 'audio' },
  { id: 'enhance-audio', name: 'تحسين الصوت', description: 'تحسين الصوت بضبط المستوى والتلاشي والتنعيم والوضوح.', icon: SlidersHorizontal, category: 'audio' },
 
  // QR CODE
  { id: 'qr-generator', name: 'مولد QR', description: 'إنشاء رموز QR من نص أو روابط أو بيانات', icon: QrCode, category: 'qrcode' },
  { id: 'qr-scanner-image', name: 'مسح QR — صورة', description: 'مسح وفك ترميز رمز QR من صورة مرفوعة', icon: ScanLine, category: 'qrcode' },
  { id: 'qr-scanner-camera', name: 'مسح QR — كاميرا', description: 'مسح رمز QR مباشرة بالكاميرا (متوافق مع الهاتف والأجهزة اللوحية)', icon: Camera, category: 'qrcode' },


]
export function getToolsByCategory(category: ToolCategory): Tool[] {
  return tools.filter((t) => t.category === category);
}

export function getToolById(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}

export function searchTools(query: string): Tool[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return tools.filter(
    (t) =>
      t.id.includes(q) ||
      t.name.includes(q) ||
      t.description.includes(q),
  );
}
export const categories: Record<ToolCategory, CategoryMeta> = {
  general: {
    name: "عام",
    icon: GraduationCap,
  },
  medical: {
    name: "القسم الطبي",
    icon: HeartPulse,
  },
  engineering: {
    name: "القسم الهندسي",
    icon: Cog,
  },

  pdf: {
    name: "أدوات الPDF",
    icon: FileText,
  },
  powerpoint: {
    name: "أدوات الPowerPoint",
    icon: Presentation,
  },
  video: {
    name: "أدوات الفيديو",
    icon: Video,
  },
  images: {
    name: "أدوات الصور",
    icon: ImageIcon,
  },
  audio: {
    name: "أدوات الصوت",
    icon: Mic,
  },
  qrcode: {
    name: "رمز QR",
    icon: QrCode,
  },

};
export const categoryOrder: ToolCategory[] = [
  'general',
  'medical',
  'engineering',
  'pdf',
  'powerpoint',
  'video',
  'images',
  'audio',
  'qrcode',

];
export function getCategoryInfo(category: ToolCategory): CategoryMeta {
  return categories[category];
}
