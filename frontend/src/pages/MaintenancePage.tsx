import { Clock, Construction, Mail } from 'lucide-react';
import { Card } from '@/components/UI/Card';
import { MAINTENANCE_CONTACT_EMAIL } from '@/config/maintenance';

export function MaintenancePage() {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen w-full flex items-center justify-center bg-light-bg dark:bg-dark-bg px-4 py-10 sm:py-16"
    >
      <Card
        padding="lg"
        className="w-full max-w-xl text-center [font-family:'Noto_Sans_Arabic',Inter,system-ui,sans-serif]"
      >
        <img
          src="/morven.png"
          alt="مورفن"
          width={64}
          height={64}
          className="w-16 h-16 mx-auto object-contain"
        />

        <div className="w-20 h-20 mx-auto mt-8 rounded-3xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 flex items-center justify-center text-primary-500 dark:text-primary-400">
          <Construction className="w-10 h-10" aria-hidden="true" />
        </div>

        <h1 className="mt-6 text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
          مورفن قيد الصيانة والتحديث
        </h1>

        <p className="mt-4 text-sm sm:text-base text-gray-500 dark:text-gray-400 leading-loose">
          نعمل حاليًا على إجراء بعض التحديثات والصيانة لتحسين تجربتكم على مورفن.
          نعتذر عن التوقف المؤقت، ونسعى إلى إعادة الموقع للعمل في أقرب وقت
          ممكن.
        </p>

        <p className="mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-300">
          لمزيد من المعلومات، يرجى التواصل مع مالك الموقع.
        </p>

        <a
          href={`mailto:${MAINTENANCE_CONTACT_EMAIL}`}
          className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm sm:text-base font-medium shadow-md shadow-primary-600/20 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-bg"
        >
          <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>تواصل مع مالك الموقع</span>
        </a>

        <div className="mt-8 pt-6 border-t border-light-border dark:border-dark-border">
          <p className="inline-flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span dir="ltr">{MAINTENANCE_CONTACT_EMAIL}</span>
          </p>
        </div>
      </Card>
    </div>
  );
}