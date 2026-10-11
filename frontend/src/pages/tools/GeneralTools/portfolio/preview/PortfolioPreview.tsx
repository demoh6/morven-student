import type { MockBatch, MockSubject, MockUniversity, PortfolioField, PortfolioTemplate, PortfolioSection } from '../types';
import { FIELD, portfolioSections } from '../data/mock';

const infoRows: { fieldId: string; label: string }[] = [
  { fieldId: FIELD.STUDENT_NAME, label: 'الاسم الكامل' },
  { fieldId: FIELD.STUDENT_ID, label: 'الرقم الجامعي' },
  { fieldId: FIELD.PHONE, label: 'رقم الهاتف' },
  { fieldId: FIELD.EMAIL, label: 'البريد الأكاديمي' },
  { fieldId: FIELD.COURSE, label: 'المقرر الدراسي' },
  { fieldId: FIELD.UNIVERSITY, label: 'الجامعة' },
];

interface PortfolioPreviewProps {
  fields: PortfolioField[];
  template: PortfolioTemplate;
  university: MockUniversity;
  subject: MockSubject;
  batch: MockBatch;
}

function buildFieldMap(fields: PortfolioField[]): Map<string, PortfolioField> {
  return new Map(fields.map((f) => [f.id, f]));
}

function MissingValue() {
  return (
    <span className="inline-block min-w-[3ch] border-b border-dashed border-gray-300 text-gray-300 px-2">
      ......
    </span>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-[13px] font-bold text-gray-900 mb-3 pb-1.5 border-b-2 border-gray-900">
      {children}
    </h3>
  );
}

function BodyText({ value }: { value: string }) {
  return (
    <p className="text-[11.5px] leading-relaxed text-gray-800 whitespace-pre-line">{value}</p>
  );
}

export default function PortfolioPreview({ fields, template, university, subject, batch }: PortfolioPreviewProps) {
  const byId = buildFieldMap(fields);

  const valueOf = (id: string) => byId.get(id)?.value ?? '';
  const sectionOf = (id: string): PortfolioSection | undefined =>
    portfolioSections.find((s) => s.id === id);

  const coverFieldIds = template.coverFieldIds;
  const bodyPages: string[][] = [];
  for (let i = 0; i < template.bodySectionIds.length; i += 2) {
    bodyPages.push(template.bodySectionIds.slice(i, i + 2));
  }

  const photo = valueOf(FIELD.STUDENT_PHOTO);

  return (
    <div className="bg-white text-gray-900" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', 'Tahoma', sans-serif" }}>
      {/* ============ Cover page ============ */}
      <div
        className="relative overflow-hidden w-full"
        style={{ minHeight: '297mm', padding: '0 16mm', boxSizing: 'border-box' }}
      >
        <div
          className="absolute top-0 inset-x-0 text-white text-center py-5"
          style={{ background: university.color }}
        >
          <p className="text-[13px] font-bold tracking-wide">{university.name}</p>
        </div>

        <div className="flex flex-col items-center text-center" style={{ paddingTop: '48mm' }}>
          <div
            className="w-[30mm] h-[30mm] rounded-full flex items-center justify-center text-white font-bold text-[22px] shadow-lg"
            style={{ background: university.color }}
          >
            {university.shortCode}
          </div>

          <h1 className="text-[20px] font-extrabold mt-6 text-gray-900">{template.documentTitle}</h1>

          <p className="text-[13px] font-semibold text-gray-600 mt-1.5">
            {subject.name} — {template.kind}
          </p>

          <div className="w-[40mm] h-[0.6mm] bg-gray-300 mt-5" />
          <p className="text-[11px] text-gray-400 mt-2">مقدّم إلى مؤسسة {valueOf(FIELD.UNIVERSITY) || <MissingValue />}</p>

          <div className="mt-10 w-full max-w-[150mm] text-right space-y-2">
            {coverFieldIds.map((id) => {
              const label = byId.get(id)?.label;
              const value = valueOf(id);
              if (!label) return null;
              return (
                <div key={id} className="flex items-center gap-3 text-[12px]">
                  <span className="text-gray-400 w-[55mm] shrink-0">{label}</span>
                  <span className="font-semibold text-gray-800">
                    {value.trim() ? value : <MissingValue />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-[16mm] inset-x-0 text-center">
          <div className="border-t border-gray-200 pt-4 w-full max-w-[150mm] mx-auto">
            <p className="text-[11px] text-gray-500">إعداد الطالب</p>
            <p className="text-[14px] font-bold mt-0.5">
              {valueOf(FIELD.STUDENT_NAME).trim() ? valueOf(FIELD.STUDENT_NAME) : <MissingValue />}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              الرقم الجامعي: {valueOf(FIELD.STUDENT_ID).trim() ? valueOf(FIELD.STUDENT_ID) : <MissingValue />}
            </p>
          </div>
        </div>
      </div>

      {/* ============ Student info page ============ */}
      <div
        className="relative w-full"
        style={{ minHeight: '297mm', padding: '16mm', boxSizing: 'border-box' }}
      >
        <SectionTitle>معلومات الطالب</SectionTitle>

        <div className="flex gap-6 items-start">
          <div
            className="w-[42mm] h-[50mm] rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center shrink-0 bg-gray-50"
          >
            {photo ? (
              <img src={photo} alt="صورة الطالب" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-gray-300">
                <div className="text-[26px]">▤</div>
                <p className="text-[9px] mt-1">صورة الطالب</p>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-0">
            {infoRows.map((row, i) => {
              const value = valueOf(row.fieldId);
              const bottom = i === infoRows.length - 1;
              return (
                <div
                  key={row.fieldId}
                  className={`flex items-center py-2 ${!bottom ? 'border-b border-gray-100' : ''}`}
                >
                  <span className="text-[11px] text-gray-500 w-[45mm] shrink-0">{row.label}</span>
                  <span className="text-[12px] font-semibold text-gray-800">
                    {value.trim() ? value : <MissingValue />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============ Body pages ============ */}
      {bodyPages.map((sectionIds, pageIdx) => (
        <div
          key={pageIdx}
          className="relative w-full"
          style={{ minHeight: '297mm', padding: '16mm', boxSizing: 'border-box' }}
        >
          <div className="space-y-8">
            {sectionIds.map((sectionId) => {
              const section = sectionOf(sectionId);
              if (!section) return null;
              const sectionFields = fields.filter((f) => f.sectionId === sectionId);
              return (
                <div key={sectionId}>
                  <SectionTitle>{section.title}</SectionTitle>
                  <div className="space-y-4">
                    {sectionFields.map((field) => {
                      if (field.type === 'IMAGE') {
                        return field.value ? (
                          <div key={field.id} className="w-[90mm] mx-auto">
                            <img src={field.value} alt={field.label} className="w-full rounded-lg border border-gray-200" />
                          </div>
                        ) : null;
                      }
                      const emptyRequired = field.required && !field.value.trim();
                      return (
                        <div key={field.id}>
                          <p className="text-[10px] text-gray-400 mb-1">{field.label}</p>
                          {emptyRequired ? <MissingValue /> : <BodyText value={field.value} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}