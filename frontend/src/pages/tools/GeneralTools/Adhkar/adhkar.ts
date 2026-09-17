import type { LucideIcon } from 'lucide-react';
import {
  Sunrise,
  BookOpen,
  BookCheck,
  ClipboardCheck,
  Sparkles,
  ListChecks,
  ShieldCheck,
  Bookmark,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export type DhikrCategory =
  | 'morning-evening'
  | 'before-study'
  | 'after-study'
  | 'before-exam';

/** Sub-group used only inside the morning/evening collection. */
export type DhikrGroup =
  | 'quran'
  | 'morning'
  | 'evening'
  | 'tasbih'
  | 'protection'
  | 'closing';

/** Which half of the day the morning/evening adhkar target — derived from the user's local device time. */
export type AdhkarPeriod = 'morning' | 'evening';

export type Dhikr = {
  id: string;
  category: DhikrCategory;
  text: string;
  repeatCount: number;
  source: string;
  reference?: string;
  note?: string;
  group?: DhikrGroup;
};

export type CategoryMeta = {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Shown when the category is opened, to keep study-specific items truthful. */
  disclaimer?: string;
};

// =============================================================================
// Category metadata
// =============================================================================

export const CATEGORIES: DhikrCategory[] = [
  'morning-evening',
  'before-study',
  'after-study',
  'before-exam',
];

export const CATEGORY_META: Record<DhikrCategory, CategoryMeta> = {
  'morning-evening': {
    title: 'أذكار الصباح والمساء',
    description:
      'مجموعة مأثورة من الآيات القرآنية والأذكار النبوية الصحيحة للصباح والمساء.',
    icon: Sunrise,
  },
  'before-study': {
    title: 'أذكار قبل الدراسة',
    description:
      'أدعية وأذكار عامة مأثورة مناسبة لدخول جلسة الدراسة وطلب العلم.',
    icon: BookOpen,
  },
  'after-study': {
    title: 'أذكار بعد الدراسة',
    description:
      'أدعية وأذكار عامة مأثورة مناسبة لختام جلسة الدراسة وحمد الله على إتمامها.',
    icon: BookCheck,
  },
  'before-exam': {
    title: 'أذكار قبل الامتحانات',
    description:
      'أدعية وأذكار عامة مأثورة لطلب التيسير والعلم النافع والفهم والاستعاذة من القلق.',
    icon: ClipboardCheck,
  },
};


// =============================================================================
// The adhkar content — bundled locally, works fully offline.
// Arabic texts are quoted from the Qur'an and authenticated hadith collections
// (with diacritics). They are NOT paraphrased or invented.
// =============================================================================

export const ADHKARS: Dhikr[] = [
  // ──────────────────────────── آيات من القرآن الكريم ────────────────────────────
  {
    id: 'me-ayatul-kursi',
    category: 'morning-evening',
    group: 'quran',
    text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ﴾',
    repeatCount: 1,
    source: 'القرآن الكريم — سورة البقرة (٢٥٥)',
    reference:
      'ورد في فضلها أحاديث صحيحة؛ منها: «من قرأها حين يصبح أُجير من الجن حتى يمسي» أخرجه الحاكم، وصححه الألباني.',
    note: 'تقرأ مرة واحدة صباحاً ومساءً.',
  },
  {
    id: 'me-muawwidhat',
    category: 'morning-evening',
    group: 'quran',
    text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n﴿قُلْ هُوَ اللَّهُ أَحَدٌ * اللَّهُ الصَّمَدُ * لَمْ يَلِدْ وَلَمْ يُولَدْ * وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ﴾\n﴿قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ * مِنْ شَرِّ مَا خَلَقَ * وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ * وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ * وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ﴾\n﴿قُلْ أَعُوذُ بِرَبِّ النَّاسِ * مَلِكِ النَّاسِ * إِلَٰهِ النَّاسِ * مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ * الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ * مِنَ الْجِنَّةِ وَالنَّاسِ﴾',
    repeatCount: 3,
    source: 'القرآن الكريم — سور الإخلاص والفلق والناس (١١٢-١١٤)',
    reference:
      'قال ﷺ: «قل هو الله أحد والمعوذتان حين تمسي وحين تصبح ثلاث مرات تكفيك من كل شيء» — أخرجه أبو داود والترمذي، وصححه الألباني.',
    note: 'تقرأ ثلاث مرات صباحاً ومساءً.',
  },

  // ──────────────────────────── أدعية الصباح المأثورة ────────────────────────────
  {
    id: 'me-asbahna',
    category: 'morning-evening',
    group: 'morning',
    text: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ. رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.',
    repeatCount: 1,
    source: 'رواه مسلم (٢٧٢٣)',
    note: 'تقال عند صباح كل يوم.',
  },
  {
    id: 'me-lahumma-bika-asbahna',
    category: 'morning-evening',
    group: 'morning',
    text: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ.',
    repeatCount: 1,
    source: 'رواه الترمذي (٣٣٩١)، وحسّنه الألباني',
  },
  {
    id: 'me-ushhiduka-asbahna',
    category: 'morning-evening',
    group: 'morning',
    text: 'اللَّهُمَّ إِنِّي أَصْبَحْتُ أُشْهِدُكَ، وَأُشْهِدُ حَمَلَةَ عَرْشِكَ، وَمَلَائِكَتَكَ، وَجَمِيعَ خَلْقِكَ: أَنَّكَ أَنْتَ اللَّهُ لَا إِلَٰهَ إِلَّا أَنْتَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ.',
    repeatCount: 4,
    source: 'رواه أبو داود (٥٠٦٩) والترمذي، وصححه الألباني',
    reference: '«من قالها حين يصبح أربع مرات أعتقه الله من النار».',
    note: 'تقال أربع مرات.',
  },
  {
    id: 'me-asbahna-ala-fitrat',
    category: 'morning-evening',
    group: 'morning',
    text: 'أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ، حَنِيفًا مُسْلِمًا وَمَا أَنَا مِنَ الْمُشْرِكِينَ.',
    repeatCount: 1,
    source: 'رواه أحمد، وحسّنه الألباني',
    note: 'في لفظٍ ثابت: «وما أنا من المشركين».',
  },
  {
    id: 'me-ma-asbaha-bi-min-nima',
    category: 'morning-evening',
    group: 'morning',
    text: 'اللَّهُمَّ مَا أَصْبَحَ بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.',
    repeatCount: 1,
    source: 'رواه أبو داود (٥٠٧٣) والنسائي، وحسّنه الألباني',
    reference: '«من قالها حين يصبح فقد أدى شكر يومه».',
  },

  // ──────────────────────────── أدعية المساء المأثورة ────────────────────────────
  {
    id: 'me-amsayna',
    category: 'morning-evening',
    group: 'evening',
    text: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ. رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.',
    repeatCount: 1,
    source: 'رواه مسلم (٢٧٢٣)',
    note: 'تقال عند مساء كل يوم.',
  },
  {
    id: 'me-lahumma-bika-amsayna',
    category: 'morning-evening',
    group: 'evening',
    text: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ.',
    repeatCount: 1,
    source: 'رواه الترمذي (٣٣٩١)، وحسّنه الألباني',
  },
  {
    id: 'me-ushhiduka-amsayna',
    category: 'morning-evening',
    group: 'evening',
    text: 'اللَّهُمَّ إِنِّي أَمْسَيْتُ أُشْهِدُكَ، وَأُشْهِدُ حَمَلَةَ عَرْشِكَ، وَمَلَائِكَتَكَ، وَجَمِيعَ خَلْقِكَ: أَنَّكَ أَنْتَ اللَّهُ لَا إِلَٰهَ إِلَّا أَنْتَ، وَأَنَّ مُحَمَّدًا عَبْدُكَ وَرَسُولُكَ.',
    repeatCount: 4,
    source: 'رواه أبو داود (٥٠٦٩) والترمذي، وصححه الألباني',
    reference: '«من قالها حين يمسي أربع مرات أعتقه الله من النار».',
    note: 'تقال أربع مرات.',
  },
  {
    id: 'me-ma-amsa-bi-min-nima',
    category: 'morning-evening',
    group: 'evening',
    text: 'اللَّهُمَّ مَا أَمْسَى بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.',
    repeatCount: 1,
    source: 'رواه أبو داود (٥٠٧٣) والنسائي، وحسّنه الألباني',
    reference: '«من قالها حين يمسي فقد أدى شكر ليلته».',
  },

  // ──────────────────────────── تسبيح وذكر ────────────────────────────
  {
    id: 'me-tahlil-100',
    category: 'morning-evening',
    group: 'tasbih',
    text: 'لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.',
    repeatCount: 100,
    source: 'رواه البخاري (٣٢٩٣) ومسلم (٢٦٩١)',
    reference:
      '«كانت له عدل عشر رقاب، وكتبت له مائة حسنة، ومحيت عنه مائة سيئة، وكانت له حرزاً من الشيطان يومه ذلك حتى يمسي».',
    note: 'تقال مائة مرة في اليوم.',
  },
  {
    id: 'me-tasbih-100',
    category: 'morning-evening',
    group: 'tasbih',
    text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.',
    repeatCount: 100,
    source: 'رواه البخاري ومسلم',
    reference: '«من قالها في يوم مائة مرة حُطّت خطاياه وإن كانت مثل زبد البحر».',
    note: 'تقال مائة مرة في اليوم.',
  },
  {
    id: 'me-hasbiyallah',
    category: 'morning-evening',
    group: 'tasbih',
    text: 'حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ.',
    repeatCount: 7,
    source: 'رواه أبو داود (٥٠٨١)',
    reference: '«من قالها حين يصبح وحين يمسي سبع مرات كفاه الله ما أهمه».',
    note: 'تقال سبع مرات صباحاً ومساءً.',
  },
  {
    id: 'me-raditu',
    category: 'morning-evening',
    group: 'tasbih',
    text: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا.',
    repeatCount: 3,
    source: 'رواه الترمذي والنسائي، وصححه الألباني',
    reference: '«من قالها ثلاثاً حين يصبح وحين يمسي كان حقاً على الله أن يرضيه يوم القيامة».',
  },

  // ──────────────────────────── أذكار الحماية والتحصين ────────────────────────────
  {
    id: 'me-bismillah-la-yadur',
    category: 'morning-evening',
    group: 'protection',
    text: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ.',
    repeatCount: 3,
    source: 'رواه أبو داود والترمذي، وحسّنه الألباني',
    reference: '«من قالها ثلاثاً لم تضره مصيبة».',
  },
  {
    id: 'me-afini-fi-badani',
    category: 'morning-evening',
    group: 'protection',
    text: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَٰهَ إِلَّا أَنْتَ. اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكُفْرِ وَالْفَقْرِ، اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ، لَا إِلَٰهَ إِلَّا أَنْتَ.',
    repeatCount: 3,
    source: 'رواه أبو داود (٥٠٩٠) والترمذي',
    note: 'تقال ثلاث مرات صباحاً ومساءً.',
  },
  {
    id: 'me-ashidu-bikalamat-allah',
    category: 'morning-evening',
    group: 'protection',
    text: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ.',
    repeatCount: 3,
    source: 'رواه مسلم (٢٧٠٨)',
    reference: '«من قالها حين يمسي ثلاث مرات لم تضره حُمَة تلك الليلة».',
    note: 'تقال ثلاث مرات عند المساء.',
  },
  {
    id: 'me-alim-ghayb',
    category: 'morning-evening',
    group: 'protection',
    text: 'اللَّهُمَّ عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ الشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَى نَفْسِي سُوءًا أَوْ أَجُرَّهُ إِلَى مُسْلِمٍ.',
    repeatCount: 1,
    source: 'رواه أبو داود والترمذي، وقال: حديث حسن صحيح',
    note: 'تقال صباحاً ومساءً.',
  },

  // ──────────────────────────── أذكار ختامية ────────────────────────────
  {
    id: 'me-sayyid-istighfar',
    category: 'morning-evening',
    group: 'closing',
    text: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي، فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ.',
    repeatCount: 1,
    source: 'رواه البخاري (٦٣٠٦)',
    reference:
      '«من قالها نهاراً موقناً بها فمات من يومه قبل أن يمسي فهو من أهل الجنة، ومن قالها من الليل وهو موقن بها فمات قبل أن يصبح فهو من أهل الجنة».',
    note: 'تقال صباحاً ومساءً.',
  },
  {
    id: 'me-istighfar',
    category: 'morning-evening',
    group: 'closing',
    text: 'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَٰهَ إِلَّا هُوَ الْحَيَّ الْقَيُّومَ وَأَتُوبُ إِلَيْهِ.',
    repeatCount: 3,
    source: 'رواه أبو داود والترمذي، وحسّنه الألباني',
    reference: '«من قالها غُفر له وإن كان فرّ من الزحف».',
  },

  // ──────────────────────────── أذكار قبل الدراسة ────────────────────────────
  {
    id: 'bs-rabbi-zidni-ilma',
    category: 'before-study',
    text: '﴿وَقُلْ رَبِّ زِدْنِي عِلْمًا﴾',
    repeatCount: 1,
    source: 'القرآن الكريم — سورة طه (١١٤)',
    note: 'دعاء قرآني نافع عند طلب العلم، وليس سنة خاصة بفعلٍ بعينه.',
  },
  {
    id: 'bs-rabbi-shrah',
    category: 'before-study',
    text: '﴿رَبِّ اشْرَحْ لِي صَدْرِي * وَيَسِّرْ لِي أَمْرِي * وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي * يَفْقَهُوا قَوْلِي﴾',
    repeatCount: 1,
    source: 'القرآن الكريم — سورة طه (٢٥-٢٨)',
    reference: 'دعاء موسى عليه السلام حين أُرسل إلى فرعون، نافع لسؤال الفهم والتيسير.',
  },
  {
    id: 'bs-anfini',
    category: 'before-study',
    text: 'اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا.',
    repeatCount: 1,
    source: 'رواه الترمذي (٣٥٩٩) وابن ماجه، وحسّنه الألباني',
    note: 'دعاء مأثور عام من أنسب ما يُدعى به عند الطلب؛ ولا يختص بالدراسة بذاته.',
  },
  {
    id: 'bs-asaluka-ilman-nafian',
    category: 'before-study',
    text: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا.',
    repeatCount: 1,
    source: 'رواه ابن ماجه (٩٢٥) والترمذي، وحسّنه الألباني',
    note: 'دعاء مأثور نافع قبل جلسات العلم والمذاكرة.',
  },

  // ──────────────────────────── أذكار بعد الدراسة ────────────────────────────
  {
    id: 'as-kufarat-majlis',
    category: 'after-study',
    text: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ.',
    repeatCount: 1,
    source: 'رواه الترمذي والنسائي، وحسّنه الألباني',
    reference:
      'عن أبي هريرة رضي الله عنه قال: قال رسول الله ﷺ: «من جلس في مجلس فكثر فيه لغطه فقال قبل أن يقوم: سبحانك اللهم... إلا غفر له ما كان في مجلسه ذلك».',
    note: 'تقال في ختام أي مجلس، ومنه مجلس المذاكرة.',
  },
  {
    id: 'as-hamdulillah',
    category: 'after-study',
    text: 'الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ.',
    repeatCount: 1,
    source: 'رواه ابن ماجه، وحسّنه الألباني',
    note: 'قالها ﷺ عند ما يسرّه؛ مناسب للشكر بعد إنجاز جلسة الدراسة.',
  },
  {
    id: 'as-ashudu-bi-ilmin-la-yanfa',
    category: 'after-study',
    text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لَا يَنْفَعُ، وَمِنْ قَلْبٍ لَا يَخْشَعُ، وَمِنْ نَفْسٍ لَا تَشْبَعُ، وَمِنْ دَعْوَةٍ لَا يُسْتَجَابُ لَهَا.',
    repeatCount: 1,
    source: 'رواه مسلم (٢٧٢٢)',
    note: 'نافع عند ختام جلسة العلم سؤالاً لله انتفاع العلم.',
  },
  {
    id: 'as-rabanna-atina',
    category: 'after-study',
    text: '﴿رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ﴾',
    repeatCount: 1,
    source: 'القرآن الكريم — سورة البقرة (٢٠١)',
    reference: 'كان النبي ﷺ يكثر من الدعاء به — متفق عليه.',
  },

  // ──────────────────────────── أذكار قبل الامتحانات ────────────────────────────
  {
    id: 'be-la-sahla',
    category: 'before-exam',
    text: 'اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا.',
    repeatCount: 1,
    source: 'رواه ابن حبان، وصححه الألباني',
    note: 'دعاء عام من أدعية التيسير، مناسِب قبل الامتحان.',
  },
  {
    id: 'be-ashudu-min-hamm',
    category: 'before-exam',
    text: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ، وَغَلَبَةِ الرِّجَالِ.',
    repeatCount: 1,
    source: 'رواه البخاري (٦٣٦٩)',
    note: 'نافعة للاستعاذة من القلق والتوتر الذي قد يسبق الامتحان.',
  },
  {
    id: 'be-raini-ala-zikrika',
    category: 'before-exam',
    text: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ.',
    repeatCount: 1,
    source: 'رواه أبو داود والنسائي، وصححه الألباني',
  },
  {
    id: 'be-hasbuna',
    category: 'before-exam',
    text: '﴿حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ﴾',
    repeatCount: 1,
    source: 'القرآن الكريم — سورة آل عمران (١٧٣)',
    reference: 'قالها إبراهيم عليه السلام ورسول الله ﷺ وأصحابه عند اشتداد الأمر.',
  },
  {
    id: 'be-rabbi-shrah',
    category: 'before-exam',
    text: '﴿رَبِّ اشْرَحْ لِي صَدْرِي * وَيَسِّرْ لِي أَمْرِي * وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي * يَفْقَهُوا قَوْلِي﴾',
    repeatCount: 1,
    source: 'القرآن الكريم — سورة طه (٢٥-٢٨)',
    note: 'دعاء قرآني نافع عند الحاجة إلى الفهم وحسن الإجابة.',
  },
];

// =============================================================================
// Helpers (pure, offline)
// =============================================================================

export function getAdhkarByCategory(category: DhikrCategory): Dhikr[] {
  return ADHKARS.filter((d) => d.category === category);
}

const PERIOD_HIDDEN_GROUPS: Record<AdhkarPeriod, DhikrGroup> = {
  morning: 'evening',
  evening: 'morning',
};

/**
 * Which day period applies at the given local time: Morning Azkar from
 * 02:00 AM inclusive until 02:00 PM exclusive, and Evening Azkar from
 * 02:00 PM inclusive until 02:00 AM exclusive. Always evaluated against the
 * user's local/device time — never UTC.
 */
export function getAdhkarPeriod(date: Date = new Date()): AdhkarPeriod {
  const hour = date.getHours();
  return hour >= 2 && hour < 14 ? 'morning' : 'evening';
}

/**
 * Filters a list of dhikr for the active day period. Only the morning/evening
 * collection is affected: the time-specific `morning` and `evening` groups swap
 * (morning period hides the `evening` group and vice-versa), while the shared
 * groups and every other category — plus approved user submissions, which carry
 * no group — are returned unchanged.
 */
export function filterAdhkarByPeriod(
  dhikrs: Dhikr[],
  period: AdhkarPeriod,
): Dhikr[] {
  const hidden = PERIOD_HIDDEN_GROUPS[period];
  return dhikrs.filter((d) => d.group !== hidden);
}

export function getAdhkarHeroText(period: AdhkarPeriod): {
  title: string;
  description: string;
} {
  return period === 'morning'
    ? {
        title: 'أذكار الصباح',
        description:
          'تكون هذه أذكار صباح بشكل تلقائي حسب التوقيت المحلي لجهازك (2:00pm-2:00am)',
      }
    : {
        title: 'أذكار المساء',
        description:
          'تكون هذه أذكار مساء بشكل تلقائي حسب التوقيت المحلي لجهازك (2:00am-2:00pm)',
      };
}

export function getAdhkarById(id: string): Dhikr | undefined {
  return ADHKARS.find((d) => d.id === id);
}

export function searchAdhkar(query: string, dhikrs: Dhikr[]): Dhikr[] {
  const q = query.trim();
  if (!q) return dhikrs;
  return dhikrs.filter(
    (d) =>
      d.text.includes(q) ||
      d.source.includes(q) ||
      (d.reference ?? '').includes(q) ||
      (d.note ?? '').includes(q),
  );
}

export function getCategoryProgress(
  category: DhikrCategory,
  counts: Record<string, number>,
  items: Dhikr[] = getAdhkarByCategory(category),
): { completed: number; total: number } {
  const completed = items.filter(
    (d) => (counts[d.id] ?? 0) >= d.repeatCount,
  ).length;
  return { completed, total: items.length };
}