import type {
  MockSubject,
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
