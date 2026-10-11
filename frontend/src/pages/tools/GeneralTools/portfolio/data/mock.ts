import type {
  MockBatch,
  MockSubject,
  MockUniversity,
  PortfolioField,
  PortfolioSection,
  PortfolioTemplate,
} from '../types';

// Field id constants (single source of truth used by templates & preview)
export const FIELD = {
  STUDENT_NAME: 'studentName',
  STUDENT_ID: 'studentId',
  STUDENT_PHOTO: 'studentPhoto',
  PHONE: 'phone',
  EMAIL: 'email',
  UNIVERSITY: 'universityName',
  FACULTY: 'faculty',
  DEPARTMENT: 'department',
  ACADEMIC_YEAR: 'academicYear',
  COURSE: 'course',
  INTRODUCTION: 'introduction',
  REFLECTION: 'reflection',
  OUTCOMES: 'learningOutcomes',
  NOTES: 'additionalNotes',
  EXTRA_IMAGE: 'extraImage',
} as const;

export const SECTION = {
  STUDENT: 'section-student',
  UNIVERSITY: 'section-university',
  INTRO: 'section-intro',
  REFLECTION: 'section-reflection',
  OUTCOMES: 'section-outcomes',
  NOTES: 'section-notes',
} as const;

export const portfolioSections: PortfolioSection[] = [
  {
    id: SECTION.STUDENT,
    title: 'معلومات الطالب',
    description: 'بيانات الطالب الشخصية التي تظهر في صفحة التعريف.',
  },
  {
    id: SECTION.UNIVERSITY,
    title: 'الجامعة والمقرر',
    description: 'البيانات الرسمية للجامعة والكلية والمقرر الدراسي.',
  },
  {
    id: SECTION.INTRO,
    title: 'المقدمة',
    description: 'نبذة تعرّف عن صاحب الملف ومحتواه.',
  },
  {
    id: SECTION.REFLECTION,
    title: 'التفكر والتأمل',
    description: 'أبرز ما تعلمته من المقرر وتأثيره فيك.',
  },
  {
    id: SECTION.OUTCOMES,
    title: 'مخرجات التعلم',
    description: 'المراجع الفعلية المطلوبة في قالب مؤسستك.',
  },
  {
    id: SECTION.NOTES,
    title: 'ملاحظات إضافية',
    description: 'أي إضافات أو صور إثباتية تريد إرفاقها.',
  },
];

export const mockUniversities: MockUniversity[] = [
  { id: 'u-najah', name: 'جامعة النجاح الوطنية', nameEn: 'An-Najah National University', city: 'نابلس', shortCode: 'نج', color: '#1b5e20', established: 1977, students: '22,000+' },
  { id: 'u-birzeit', name: 'جامعة بيرزيت', nameEn: 'Birzeit University', city: 'بيرزيت', shortCode: 'ب', color: '#0d47a1', established: 1924, students: '14,000+' },
  { id: 'u-ppu', name: 'جامعة بوليتكنك فلسطين', nameEn: 'Palestine Polytechnic University', city: 'الخليل', shortCode: 'بو', color: '#e65100', established: 1978, students: '9,000+' },
  { id: 'u-iug', name: 'الجامعة الإسلامية', nameEn: 'Islamic University of Gaza', city: 'غزة', shortCode: 'إ', color: '#00695c', established: 1978, students: '20,000+' },
  { id: 'u-quds', name: 'جامعة القدس', nameEn: 'Al-Quds University', city: 'القدس / أبو ديس', shortCode: 'ق', color: '#4a148c', established: 1984, students: '12,000+' },
  { id: 'u-hebron', name: 'جامعة الخليل', nameEn: 'Hebron University', city: 'الخليل', shortCode: 'خ', color: '#bf360c', established: 1971, students: '10,000+' },
  { id: 'u-aaup', name: 'الجامعة العربية الأمريكية', nameEn: 'Arab American University', city: 'جنين', shortCode: 'ع', color: '#1565c0', established: 2000, students: '11,000+' },
  { id: 'u-aqsa', name: 'جامعة الأقصى', nameEn: 'Al-Aqsa University', city: 'غزة', shortCode: 'أ', color: '#37474f', established: 1991, students: '17,000+' },
];

const yearLabels = [
  { id: 'y1', label: 'السنة الأولى', years: '2025/2026', description: 'الدفعة الأولى — السنة التأسيسية' },
  { id: 'y2', label: 'السنة الثانية', years: '2024/2025', description: 'الدفعة الثانية — التعمق في التخصص' },
  { id: 'y3', label: 'السنة الثالثة', years: '2023/2024', description: 'الدفعة الثالثة — مرحلة التطبيق' },
  { id: 'y4', label: 'السنة الرابعة', years: '2022/2023', description: 'الدفعة الرابعة — مرحلة التخرج' },
  { id: 'y5', label: 'السنة الخامسة', years: '2021/2022', description: 'الدفعة الخامسة — سنة إتمام المقررات' },
];

const batchPlan: Record<string, number> = {
  'u-najah': 5,
  'u-birzeit': 4,
  'u-ppu': 4,
  'u-iug': 4,
  'u-quds': 4,
  'u-hebron': 3,
  'u-aaup': 3,
  'u-aqsa': 4,
};

export const mockBatches: MockBatch[] = mockUniversities.flatMap((uni) =>
  Array.from({ length: batchPlan[uni.id] ?? 4 }, (_, i) => {
    const y = yearLabels[i] ?? yearLabels[yearLabels.length - 1];
    return {
      id: `${uni.id}-${i + 1}`,
      universityId: uni.id,
      label: y.label,
      order: i + 1,
      academicYears: y.years,
      description: y.description,
    };
  }),
);

export const mockSubjects: MockSubject[] = [
  // Najah
  { id: 's-najah-civil', universityId: 'u-najah', batchIds: ['u-najah-3', 'u-najah-4', 'u-najah-5'], name: 'الهندسة المدنية', code: 'CIV', description: 'تصميم المنشآت وإدارة المشاريع', portfolioKind: 'مشروع تخرج' },
  { id: 's-najah-software', universityId: 'u-najah', batchIds: ['u-najah-3', 'u-najah-4'], name: 'هندسة البرمجيات', code: 'SWE', description: 'تحليل وتصميم النظم البرمجية', portfolioKind: 'مشروع تخرج' },
  { id: 's-najah-cs', universityId: 'u-najah', batchIds: ['u-najah-1', 'u-najah-2', 'u-najah-3', 'u-najah-4'], name: 'علوم الحاسوب', code: 'CS', description: 'الخوارزميات والذكاء الاصطناعي', portfolioKind: 'مقرر' },
  { id: 's-najah-arch', universityId: 'u-najah', batchIds: ['u-najah-2', 'u-najah-3', 'u-najah-4'], name: 'الهندسة المعمارية', code: 'ARCH', description: 'التصميم المعماري والمشاريع', portfolioKind: 'مقرر' },
  { id: 's-najah-med', universityId: 'u-najah', batchIds: ['u-najah-3', 'u-najah-4'], name: 'الطب البشري', code: 'MED', description: 'العلوم الطبية الأساسية والسريرية', portfolioKind: 'ملف إنجاز' },
  { id: 's-najah-biz', universityId: 'u-najah', batchIds: ['u-najah-2', 'u-najah-3'], name: 'إدارة الأعمال', code: 'BA', description: 'ريادة الأعمال وإدارة الموارد', portfolioKind: 'مقرر' },
  { id: 's-najah-nursing', universityId: 'u-najah', batchIds: ['u-najah-2', 'u-najah-3', 'u-najah-4'], name: 'التمريض', code: 'NRS', description: 'العناية التمريضية في المستشفيات', portfolioKind: 'تدريب ميداني' },
  // Birzeit
  { id: 's-birz-ee', universityId: 'u-birzeit', batchIds: ['u-birzeit-2', 'u-birzeit-3'], name: 'الهندسة الكهربائية', code: 'EE', description: 'الأنظمة والاتصالات والطاقة', portfolioKind: 'مقرر' },
  { id: 's-birz-econ', universityId: 'u-birzeit', batchIds: ['u-birzeit-1', 'u-birzeit-2', 'u-birzeit-3'], name: 'الاقتصاد', code: 'ECO', description: 'الاقتصاد والتنمية', portfolioKind: 'مقرر' },
  { id: 's-birz-law', universityId: 'u-birzeit', batchIds: ['u-birzeit-1', 'u-birzeit-2'], name: 'القانون', code: 'LAW', description: 'القانون العام والخاص', portfolioKind: 'مقرر' },
  { id: 's-birz-media', universityId: 'u-birzeit', batchIds: ['u-birzeit-1', 'u-birzeit-2', 'u-birzeit-3'], name: 'الإعلام', code: 'MEDIA', description: 'الصحافة والإعلام الرقمي', portfolioKind: 'مشروع تخرج' },
  { id: 's-birz-pharm', universityId: 'u-birzeit', batchIds: ['u-birzeit-2', 'u-birzeit-3', 'u-birzeit-4'], name: 'الصيدلة', code: 'PHR', description: 'العلوم الدوائية والسريرية', portfolioKind: 'ملف إنجاز' },
  // PPU
  { id: 's-ppu-mechatronics', universityId: 'u-ppu', batchIds: ['u-ppu-2', 'u-ppu-3', 'u-ppu-4'], name: 'هندسة الميكاترونكس', code: 'MCT', description: 'دمج الميكانيكا والكهرباء والبرمجة', portfolioKind: 'مشروع تخرج' },
  { id: 's-ppu-industrial', universityId: 'u-ppu', batchIds: ['u-ppu-1', 'u-ppu-2', 'u-ppu-3'], name: 'الهندسة الصناعية', code: 'IND', description: 'إدارة الإنتاج والجودة', portfolioKind: 'مقرر' },
  { id: 's-ppu-interior', universityId: 'u-ppu', batchIds: ['u-ppu-1', 'u-ppu-2'], name: 'التصميم الداخلي', code: 'INT', description: 'التصميم الداخلي والفراغات', portfolioKind: 'مقرر' },
  { id: 's-ppu-mis', universityId: 'u-ppu', batchIds: ['u-ppu-1', 'u-ppu-2', 'u-ppu-3'], name: 'نظم المعلومات الإدارية', code: 'MIS', description: 'أنظمة المعلومات واتخاذ القرار', portfolioKind: 'مقرر' },
  // IUG
  { id: 's-iug-sharia', universityId: 'u-iug', batchIds: ['u-iug-1', 'u-iug-2', 'u-iug-3'], name: 'الشريعة الإسلامية', code: 'SH', description: 'الدراسات الإسلامية والقضايا المعاصرة', portfolioKind: 'مقرر' },
  { id: 's-iug-civil', universityId: 'u-iug', batchIds: ['u-iug-3', 'u-iug-4'], name: 'الهندسة المدنية', code: 'CIV', description: 'المنشآت والطرق والبنية التحتية', portfolioKind: 'مشروع تخرج' },
  { id: 's-iug-med', universityId: 'u-iug', batchIds: ['u-iug-2', 'u-iug-3', 'u-iug-4'], name: 'الطب البشري', code: 'MED', description: 'البرنامج الطبي التكاملي', portfolioKind: 'ملف إنجاز' },
  { id: 's-iug-edtech', universityId: 'u-iug', batchIds: ['u-iug-1', 'u-iug-2'], name: 'تكنولوجيا التعليم', code: 'EDT', description: 'دمج التكنولوجيا في التعليم', portfolioKind: 'مقرر' },
  // Al-Quds
  { id: 's-quds-med', universityId: 'u-quds', batchIds: ['u-quds-2', 'u-quds-3'], name: 'الطب والصحة العامة', code: 'MED', description: 'العلوم الطبية والصحة المجتمعية', portfolioKind: 'ملف إنجاز' },
  { id: 's-quds-arts', universityId: 'u-quds', batchIds: ['u-quds-1', 'u-quds-2'], name: 'الآداب والعلوم الإنسانية', code: 'ART', description: 'اللغات والدراسات الإنسانية', portfolioKind: 'مقرر' },
  { id: 's-quds-applied', universityId: 'u-quds', batchIds: ['u-quds-2', 'u-quds-3'], name: 'العلوم التطبيقية', code: 'SC', description: 'الفيزياء والكيمياء والعلوم البيئية', portfolioKind: 'مقرر' },
  { id: 's-quds-intlaw', universityId: 'u-quds', batchIds: ['u-quds-3', 'u-quds-4'], name: 'القانون الدولي', code: 'ILAW', description: 'القانون الدولي وحقوق الإنسان', portfolioKind: 'مقرر' },
  // Hebron
  { id: 's-hbr-midwifery', universityId: 'u-hebron', batchIds: ['u-hebron-1', 'u-hebron-2', 'u-hebron-3'], name: 'القبالة والتمريض', code: 'MID', description: 'الرعاية الصحية للمرأة والطفل', portfolioKind: 'تدريب ميداني' },
  { id: 's-hbr-dent', universityId: 'u-hebron', batchIds: ['u-hebron-1', 'u-hebron-2', 'u-hebron-3'], name: 'طب الأسنان', code: 'DENT', description: 'العلوم السريرية لطب الأسنان', portfolioKind: 'ملف إنجاز' },
  { id: 's-hbr-ba', universityId: 'u-hebron', batchIds: ['u-hebron-1', 'u-hebron-2'], name: 'إدارة الأعمال', code: 'BA', description: 'العلوم الإدارية والمحاسبية', portfolioKind: 'مقرر' },
  // AAUP
  { id: 's-aaup-nursing', universityId: 'u-aaup', batchIds: ['u-aaup-1', 'u-aaup-2', 'u-aaup-3'], name: 'التمريض', code: 'NRS', description: 'برنامج التمريض السريري', portfolioKind: 'تدريب ميداني' },
  { id: 's-aaup-pt', universityId: 'u-aaup', batchIds: ['u-aaup-1', 'u-aaup-2', 'u-aaup-3'], name: 'العلاج الطبيعي', code: 'PT', description: 'التأهيل والعلاج الحركي', portfolioKind: 'ملف إنجاز' },
  { id: 's-aaup-finance', universityId: 'u-aaup', batchIds: ['u-aaup-1', 'u-aaup-2'], name: 'العلوم المالية والمصرفية', code: 'FIN', description: 'التمويل والمصارف والأسواق', portfolioKind: 'مقرر' },
  // Al-Aqsa
  { id: 's-aqsa-ict', universityId: 'u-aqsa', batchIds: ['u-aqsa-1', 'u-aqsa-2', 'u-aqsa-3'], name: 'تكنولوجيا المعلومات', code: 'IT', description: 'الشبكات والبرمجة وأمن المعلومات', portfolioKind: 'مقرر' },
  { id: 's-aqsa-sport', universityId: 'u-aqsa', batchIds: ['u-aqsa-1', 'u-aqsa-2', 'u-aqsa-3'], name: 'التربية البدنية', code: 'PE', description: 'التربية البدنية والرياضة المدرسية', portfolioKind: 'مقرر' },
  { id: 's-aqsa-scie', universityId: 'u-aqsa', batchIds: ['u-aqsa-1', 'u-aqsa-2'], name: 'العلوم', code: 'SCI', description: 'فيزياء وكيمياء وأحياء وتدريسها', portfolioKind: 'مقرر' },
];

const SAMPLE_INTRO =
  'أكتب هذا الملف ليُوثّق رحلتي التعليمية في هذا المقرر، وأستعرض فيه ما اكتسبته من معارف ومهارات، وأوضّح الخطوات التي اتخذتها لتعميق فهمي للمادة، وأعبّر عن أثر هذه التجربة على مشروعي الدراسي والمهني.';
export const SAMPLE_REFLECTION =
  'تأملت خلال هذا المقرر كيف يتحوّل التعلم النظري إلى ممارسة عملية، واكتشفت أهمية التوثيق المستمر والتغذية الراجعة في تحسين الأداء. كانت المواقف التطبيقية الأثر الأكبر في بناء ثقتي بنفسي.';
export const SAMPLE_OUTCOMES =
  '• فهم الأساسيات والأهداف العامة للمقرر.\n• تطبيق ما تعلمته في مواقف عملية.';

export interface FieldContext {
  universityName: string;
  academicYear: string;
  course: string;
}

export function buildPortfolioFields(ctx: FieldContext): PortfolioField[] {
  return [
    {
      id: FIELD.STUDENT_NAME,
      label: 'اسم الطالب (ثلاثي)',
      type: 'TEXT',
      value: 'أحمد محمد النجار',
      defaultValue: 'أحمد محمد النجار',
      required: true,
      placeholder: 'أدخل اسمك الثلاثي',
      helperText: 'استبدل النص المثال باسمك الكامل.',
      sectionId: SECTION.STUDENT,
    },
    {
      id: FIELD.STUDENT_ID,
      label: 'الرقم الجامعي',
      type: 'TEXT',
      value: '12234567',
      defaultValue: '12234567',
      required: true,
      placeholder: 'مثال: 12345678',
      sectionId: SECTION.STUDENT,
    },
    {
      id: FIELD.STUDENT_PHOTO,
      label: 'الصورة الشخصية',
      type: 'IMAGE',
      value: '',
      defaultValue: '',
      required: true,
      placeholder: 'ارفع صورتك الشخصية',
      helperText: 'ستظهر الصورة في صفحة التعريف.',
      sectionId: SECTION.STUDENT,
    },
    {
      id: FIELD.PHONE,
      label: 'رقم الهاتف',
      type: 'TEXT',
      value: '',
      defaultValue: '',
      required: false,
      placeholder: 'مثال: 0599 000 000',
      sectionId: SECTION.STUDENT,
    },
    {
      id: FIELD.EMAIL,
      label: 'البريد الأكاديمي',
      type: 'TEXT',
      value: '',
      defaultValue: '',
      required: false,
      placeholder: 'example@univ.edu.ps',
      sectionId: SECTION.STUDENT,
    },
    {
      id: FIELD.UNIVERSITY,
      label: 'اسم الجامعة',
      type: 'TEXT',
      value: ctx.universityName,
      defaultValue: ctx.universityName,
      required: true,
      placeholder: 'اسم الجامعة',
      sectionId: SECTION.UNIVERSITY,
    },
    {
      id: FIELD.FACULTY,
      label: 'الكلية',
      type: 'TEXT',
      value: 'كلية الهندسة',
      defaultValue: 'كلية الهندسة',
      required: true,
      placeholder: 'اسم الكلية',
      sectionId: SECTION.UNIVERSITY,
    },
    {
      id: FIELD.DEPARTMENT,
      label: 'القسم',
      type: 'TEXT',
      value: '',
      defaultValue: '',
      required: false,
      placeholder: 'اسم القسم',
      sectionId: SECTION.UNIVERSITY,
    },
    {
      id: FIELD.ACADEMIC_YEAR,
      label: 'المستوى الدراسي',
      type: 'TEXT',
      value: ctx.academicYear,
      defaultValue: ctx.academicYear,
      required: true,
      placeholder: 'مثال: السنة الثالثة — 2023/2024',
      sectionId: SECTION.UNIVERSITY,
    },
    {
      id: FIELD.COURSE,
      label: 'المقرر الدراسي',
      type: 'TEXT',
      value: ctx.course,
      defaultValue: ctx.course,
      required: true,
      placeholder: 'اسم المقرر',
      sectionId: SECTION.UNIVERSITY,
    },
    {
      id: FIELD.INTRODUCTION,
      label: 'المقدمة',
      type: 'TEXTAREA',
      value: SAMPLE_INTRO,
      defaultValue: SAMPLE_INTRO,
      required: true,
      placeholder: 'اكتب مقدمة مناسبة',
      sectionId: SECTION.INTRO,
    },
    {
      id: FIELD.REFLECTION,
      label: 'التفكر والتأمل',
      type: 'TEXTAREA',
      value: SAMPLE_REFLECTION,
      defaultValue: SAMPLE_REFLECTION,
      required: false,
      placeholder: 'اكتب تأملاتك',
      sectionId: SECTION.REFLECTION,
    },
    {
      id: FIELD.OUTCOMES,
      label: 'مخرجات التعلم',
      type: 'TEXTAREA',
      value: SAMPLE_OUTCOMES,
      defaultValue: SAMPLE_OUTCOMES,
      required: true,
      placeholder: 'اكتب المخرجات المطلوبة',
      sectionId: SECTION.OUTCOMES,
    },
    {
      id: FIELD.NOTES,
      label: 'ملاحظات إضافية',
      type: 'TEXTAREA',
      value: '',
      defaultValue: '',
      required: false,
      placeholder: 'أي ملاحظات أو توجيهات',
      sectionId: SECTION.NOTES,
    },
    {
      id: FIELD.EXTRA_IMAGE,
      label: 'صورة إثباتية (اختيارية)',
      type: 'IMAGE',
      value: '',
      defaultValue: '',
      required: false,
      placeholder: 'ارفع صورة لنشاط أو شهادة',
      helperText: 'تظهر في نهاية الملف.',
      sectionId: SECTION.NOTES,
    },
  ];
}

export function getTemplateForSubject(subject: MockSubject): PortfolioTemplate {
  return {
    id: `tpl-${subject.id}`,
    subjectId: subject.id,
    kind: subject.portfolioKind,
    documentTitle: `ملف الإنجاز الأكاديمي — ${subject.name}`,
    coverFieldIds: [FIELD.UNIVERSITY, FIELD.FACULTY, FIELD.DEPARTMENT, FIELD.ACADEMIC_YEAR],
    infoFieldIds: [
      FIELD.STUDENT_PHOTO,
      FIELD.STUDENT_NAME,
      FIELD.STUDENT_ID,
      FIELD.PHONE,
      FIELD.EMAIL,
      FIELD.COURSE,
      FIELD.UNIVERSITY,
    ],
    bodySectionIds: [SECTION.INTRO, SECTION.REFLECTION, SECTION.OUTCOMES, SECTION.NOTES],
  };
}

// ----- Accessors (mock-backend boundary, replaced in Phase 3) -----

export const getUniversityById = (id: string): MockUniversity | undefined =>
  mockUniversities.find((u) => u.id === id);

export const getBatchById = (id: string): MockBatch | undefined => mockBatches.find((b) => b.id === id);

export const getSubjectById = (id: string): MockSubject | undefined => mockSubjects.find((s) => s.id === id);

export const getBatchesForUniversity = (universityId: string): MockBatch[] =>
  mockBatches
    .filter((b) => b.universityId === universityId)
    .sort((a, b) => a.order - b.order);

export const getSubjectsFor = (universityId: string, batchId: string): MockSubject[] =>
  mockSubjects.filter((s) => s.universityId === universityId && s.batchIds.includes(batchId));