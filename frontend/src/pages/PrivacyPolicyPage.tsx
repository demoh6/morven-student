import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';
import { Card } from '@/components/UI/Card';

// ---------------------------------------------------------------------------
// Privacy Policy — Morven Student
// Arabic / RTL. Standalone public page (no auth required).
//
// NOTE (Phase 2): Google Sign-In is planned but NOT yet implemented. The
// Google section below describes intended data handling without claiming the
// feature is active. It refers to the contact placeholder so it can be
// completed when the feature ships.
// ---------------------------------------------------------------------------

// Each Privacy Policy section is its own Morven-style card. Uses the existing
// `Card` component (crisp white/dark-card, light/dark-border, rounded-2xl,
// soft card shadow) with lg padding and standard mb-6 stacking spacing — the
// same card language used across the rest of the application.

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1.5 mt-5">
      {children}
    </h3>
  );
}

function BodyText({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-7 mb-3 last:mb-0">
      {children}
    </p>
  );
}

function ListText({ children }: { children: ReactNode }) {
  return (
    <ul className="space-y-1.5 mb-3 last:mb-0 ps-5 list-disc marker:text-primary-500 dark:marker:text-primary-400">
      <li className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-7">
        {children}
      </li>
    </ul>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <Card padding="lg" className="mb-6">
      {children}
    </Card>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-4 py-8 sm:py-12" dir="rtl">
      <div className="max-w-3xl mx-auto">
        {/* Back to login */}
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 mb-6 group"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:ps-1" />
          <span className="font-medium">العودة إلى تسجيل الدخول</span>
        </Link>

        {/* Page header */}
        <Card padding="lg" className="mb-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-5">
              <Shield className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              سياسة الخصوصية
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              آخر تحديث: 17 سبتمبر 2026
            </p>
          </div>
        </Card>

        {/* 1. Introduction */}
        <SectionCard>
          <SectionTitle>مقدمة</SectionTitle>
          <BodyText>
            تُحترم خصوصيتك في مورفن للطلاب، حيث توضح سياسة الخصوصية هذه
            كيفية جمع المعلومات المتعلقة بك واستخدامها وحمايتها عند استخدامك
            للموقع وخدماته ومنتجاته، بالتالي فإنَّ تسجيلك لاستخدام الخدمات
            أو الدخول إليها، فإنك تقر بأنك قرأت وفهمت هذه السياسة.
          </BodyText>
        </SectionCard>

        <SectionCard>
          <SectionTitle>المعلومات التي تقدمها</SectionTitle>
          <SubTitle>معلومات الحساب</SubTitle>
          <BodyText>
            عند إنشاء حساب في مورفن، تتضمن معلومات الحساب التي تقدمها أساساً:
          </BodyText>
          <ListText>البريد الإلكتروني المستخدم للدخول إلى الخدمات.</ListText>
          <ListText>اسم المستخدم الذي تختاره.</ListText>
          <ListText>الاسم المعروض الذي تظهر به في الخدمات.</ListText>
          <BodyText>
            تُحفظ كلمة المرور التي تختارها بشكل مشفّر فقط، ولا تُخزَّن
            بنصها العادي.
          </BodyText>
        </SectionCard>

  
      

        <SectionCard>
          <SectionTitle>مشاركة المعلومات والإفصاح عنها</SectionTitle>
          <BodyText>
            لا تبيع مورفن معلوماتك الشخصية، ولا تشاركها مع المعلنين، ولا تفصح
            عنها لجهات خارجية إلا لتنفيذ الخدمات التي طلبتها (مثل استضافة
            الخدمات وتشغيلها من خلال مزودي البنية التحتية التقنية) أو عندما
            يُطلب ذلك قانوناً أو للحماية من المخاطر. لا نشارك معلوماتك الشخصية
            مع أطراف خارجية لأغراض تسويقية مستقلة.
          </BodyText>
        </SectionCard>

        <SectionCard>
          <SectionTitle>الخدمات الخارجية</SectionTitle>
          <BodyText>
            قد تعتمد الخدمات على مزوّدي بنية تحتية تقنية خارجيين (مثل شركات
            الاستضافة وتخزين قواعد البيانات) لتشغيل التطبيق. هؤلاء المزوّدون
            يعالجون البيانات اللازمة فقط لتقديم خدمتهم لنا ولا يُستخدمون لتجميع
            بياناتك لأغراض أخرى. إذا تغيّرت هذه الخدمات أو أُضيفت خدمات خارجية
            جديدة تجمع بياناتك، فسيتم تحديث هذه السياسة وفقاً لذلك.
          </BodyText>
        </SectionCard>

        <SectionCard>
          <SectionTitle>تسجيل الدخول عبر Google</SectionTitle>
          <BodyText>
                    عند تفعيل هذا الخيار واختيارك استخدامه، قد تطلب مورفن
            الحد الأدنى من المعلومات اللازمة للمصادقة من حسابك في Google، وقد
            تشمل هذه المعلومات:
          </BodyText>
          <ListText>معرّف حسابك في Google.</ListText>
          <ListText>الاسم.</ListText>
          <ListText>البريد الإلكتروني.</ListText>
          <ListText>حالة التحقق من البريد الإلكتروني.</ListText>
          <ListText>صورة الملف الشخصي، عند توفرها.</ListText>
          <BodyText>
            تُستخدم هذه المعلومات حصرياً لأغراض المصادقة والارتباط بحسابك في
            مورفن. لا تطلب مورفن حالياً الوصول إلى Gmail أو Google Drive أو
            Google Calendar أو جهات الاتصال أو غيرها من خدمات Google، ولا
            تعتمد عليها، ولن تطلب إلا الصلاحيات الدنيا المطلوبة للمصادقة. تصبح
            هذه الفقرة سارية فقط عند تفعيل «تسجيل الدخول عبر Google» في
            الخدمات.
          </BodyText>
        </SectionCard>


        <SectionCard>
          <SectionTitle>حقوقك</SectionTitle>
          <BodyText>
            يمكنك الوصول إلى معلومات حسابك وتعديلها من خلال إعدادات حسابك داخل
            التطبيق، مثل تحديث الاسم المعروض والسيرة الذاتية وصورة الملف
            الشخصي والتحكم في ظهور ملفك الشخصي (عام أو خاص). بوسعك أيضاً
            تسجيل الخروج في أي وقت. إذا كانت لديك طلبات أخرى بخصوص بياناتك
            الشخصية، أو حذف حسابك، فيمكنك التواصل معنا عبر العنوان الموضح في نهاية هذه
            السياسة.
          </BodyText>
        </SectionCard>



        {/* 19. Contact */}
        <SectionCard>
          <SectionTitle>معلومات التواصل</SectionTitle>
          <BodyText>
            إذا كان لديك أي أسئلة أو طلبات بخصوص هذه السياسة أو خصوصية بياناتك
            أو حذف حسابك، فيُرجى التواصل معنا عبر العنوان الرسمي للدعم:
          </BodyText>
          <a href="mailto:info@morven.online" style={{color:"#007bff"}}>info@morven.online</a>
        </SectionCard>

     
      </div>
    </div>
  );
}
