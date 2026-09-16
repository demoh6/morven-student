import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getToolById } from '@/data/tools';
import {
  Button,
  Card,
  Modal,
  Input,
  TextArea,
  Select,
  EmptyState,
  Badge,
  Tabs,
  Chip,
  ProgressBar,
  SearchBar,
} from '@/components/UI';
import { useAppStore } from '@/store/useAppStore';
import { useStatsStore } from '@/store/useStatsStore';
import { Notebook } from 'lucide-react';
import { ToolHero } from '@/pages/tools/ToolHero';
import {
  summarizeText,
  extractKeyIdeas,
  extractTerminology,
  generateMCQs,
  explainSimply,
} from '@/utils/ai-helpers';
import type { Flashcard, MedicalNote } from '@/types';
import {
  Search,
  Info,
  Stethoscope,
  TriangleAlert,
  Pill,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  BookOpen,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Award,
  Target,
  Sparkles,
  Layers,
  HeartPulse,
  Wind,
  Brain,
  UtensilsCrossed,
  Droplets,
  Activity,
  Droplet,
  Bug,
  Bone,
  Flower2,
  Ear,
  Dumbbell,
  FlaskConical,
  Smile,
  Syringe,
  Beaker,
  Baby,
  Siren,
  type LucideIcon,
} from 'lucide-react';
import { groupBy } from '@/utils/groupBy';
import { APP_DISPLAY_LOCALE } from '@/utils/displayLocale';
import { DISEASES } from '@/pages/tools/MedicalTools/diseases/medicalDiseases';
import { DRUGS } from '@/pages/tools/MedicalTools/drugs/medicalDrugs';
import type { DiseaseInfo, DiseaseCategory, DrugInfo } from '@/pages/tools/MedicalTools/medicalTypes';

// =============================================================================
// Types (DiseaseInfo, DiseaseCategory, DrugInfo are imported from @/data/medicalTypes)
// =============================================================================

interface LabValue {
  name: string;
  category: string;
  unit: string;
  normalRange: string;
  criticalHigh: string;
}

interface FlashcardDeck {
  id: string;
  name: string;
  icon: React.ReactNode;
  cards: { front: string; back: string }[];
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

// =============================================================================
// Disease database (imported from @/data/medicalDiseases)
// =============================================================================

// =============================================================================
// Drug database (imported from @/data/medicalDrugs)
// =============================================================================

// =============================================================================
// Lab Values (40 tests)
// =============================================================================

const LAB_VALUES: LabValue[] = [
  { name: 'WBC', category: 'Hematology', unit: 'K/uL', normalRange: '4.5 - 11.0', criticalHigh: '>30.0' },
  { name: 'RBC', category: 'Hematology', unit: 'M/uL', normalRange: '4.5 - 5.5 (M) / 4.0 - 5.0 (F)', criticalHigh: '>6.0' },
  { name: 'Hgb', category: 'Hematology', unit: 'g/dL', normalRange: '13.5 - 17.5 (M) / 12.0 - 16.0 (F)', criticalHigh: '>20.0' },
  { name: 'Hct', category: 'Hematology', unit: '%', normalRange: '38.3 - 48.6 (M) / 35.5 - 44.9 (F)', criticalHigh: '>54.0' },
  { name: 'Plt', category: 'Hematology', unit: 'K/uL', normalRange: '150 - 400', criticalHigh: '>1000' },
  { name: 'Na', category: 'Chemistry', unit: 'mEq/L', normalRange: '136 - 145', criticalHigh: '>160' },
  { name: 'K', category: 'Chemistry', unit: 'mEq/L', normalRange: '3.5 - 5.0', criticalHigh: '>6.5' },
  { name: 'Cl', category: 'Chemistry', unit: 'mEq/L', normalRange: '98 - 106', criticalHigh: '>115' },
  { name: 'CO2', category: 'Chemistry', unit: 'mEq/L', normalRange: '23 - 29', criticalHigh: '>40' },
  { name: 'BUN', category: 'Renal', unit: 'mg/dL', normalRange: '7 - 20', criticalHigh: '>100' },
  { name: 'Cr', category: 'Renal', unit: 'mg/dL', normalRange: '0.6 - 1.2', criticalHigh: '>10.0' },
  { name: 'Glucose', category: 'Chemistry', unit: 'mg/dL', normalRange: '70 - 100 (fasting)', criticalHigh: '>500' },
  { name: 'Ca', category: 'Chemistry', unit: 'mg/dL', normalRange: '8.5 - 10.5', criticalHigh: '>14.0' },
  { name: 'ALT', category: 'Hepatic', unit: 'U/L', normalRange: '7 - 56', criticalHigh: '>1000' },
  { name: 'AST', category: 'Hepatic', unit: 'U/L', normalRange: '10 - 40', criticalHigh: '>1000' },
  { name: 'ALP', category: 'Hepatic', unit: 'U/L', normalRange: '44 - 147', criticalHigh: '>500' },
  { name: 'Bilirubin', category: 'Hepatic', unit: 'mg/dL', normalRange: '0.1 - 1.2', criticalHigh: '>20.0' },
  { name: 'Albumin', category: 'Hepatic', unit: 'g/dL', normalRange: '3.5 - 5.5', criticalHigh: '<1.5 (critical low)' },
  { name: 'TSH', category: 'Endocrine', unit: 'mIU/L', normalRange: '0.4 - 4.0', criticalHigh: '>100' },
  { name: 'HbA1c', category: 'Endocrine', unit: '%', normalRange: '<5.7 (normal) / 5.7-6.4 (prediabetes)', criticalHigh: '>12.0' },
  { name: 'Troponin', category: 'Cardiac', unit: 'ng/mL', normalRange: '<0.04', criticalHigh: '>10.0' },
  { name: 'BNP', category: 'Cardiac', unit: 'pg/mL', normalRange: '<100', criticalHigh: '>4000' },
  { name: 'PT', category: 'Coagulation', unit: 'seconds', normalRange: '11 - 13.5', criticalHigh: '>100' },
  { name: 'PTT', category: 'Coagulation', unit: 'seconds', normalRange: '25 - 35', criticalHigh: '>80' },
  { name: 'INR', category: 'Coagulation', unit: 'ratio', normalRange: '0.8 - 1.1', criticalHigh: '>10.0' },
  { name: 'Total Cholesterol', category: 'Lipid Panel', unit: 'mg/dL', normalRange: '<200 (desirable)', criticalHigh: '>400' },
  { name: 'LDL', category: 'Lipid Panel', unit: 'mg/dL', normalRange: '<100 (optimal)', criticalHigh: '>190' },
  { name: 'HDL', category: 'Lipid Panel', unit: 'mg/dL', normalRange: '>40 (M) / >50 (F)', criticalHigh: '<20 (critical low)' },
  { name: 'Triglycerides', category: 'Lipid Panel', unit: 'mg/dL', normalRange: '<150', criticalHigh: '>1000' },
  { name: 'Mg', category: 'Chemistry', unit: 'mg/dL', normalRange: '1.7 - 2.2', criticalHigh: '>4.0' },
  { name: 'Phos', category: 'Chemistry', unit: 'mg/dL', normalRange: '2.5 - 4.5', criticalHigh: '>10.0' },
  { name: 'Uric Acid', category: 'Chemistry', unit: 'mg/dL', normalRange: '3.4 - 7.0 (M) / 2.4 - 6.0 (F)', criticalHigh: '>12.0' },
  { name: 'Amylase', category: 'Pancreatic', unit: 'U/L', normalRange: '28 - 100', criticalHigh: '>1000' },
  { name: 'Lipase', category: 'Pancreatic', unit: 'U/L', normalRange: '0 - 160', criticalHigh: '>1000' },
  { name: 'Lactate', category: 'Critical Care', unit: 'mmol/L', normalRange: '0.5 - 2.2', criticalHigh: '>10.0' },
  { name: 'Iron', category: 'Hematology', unit: 'mcg/dL', normalRange: '60 - 170', criticalHigh: '>400' },
  { name: 'Ferritin', category: 'Hematology', unit: 'ng/mL', normalRange: '20 - 250 (M) / 10 - 120 (F)', criticalHigh: '>1000' },
  { name: 'Vitamin D', category: 'Endocrine', unit: 'ng/mL', normalRange: '30 - 100', criticalHigh: '>150' },
  { name: 'Folate', category: 'Hematology', unit: 'ng/mL', normalRange: '2.7 - 17.0', criticalHigh: 'N/A (elevated levels not clinically critical)' },
  { name: 'B12', category: 'Hematology', unit: 'pg/mL', normalRange: '200 - 900', criticalHigh: '>2000' },
  { name: 'Cortisol', category: 'Endocrine', unit: 'mcg/dL', normalRange: '5 - 25 (AM)', criticalHigh: '>50' },
];

// =============================================================================
// Flashcard Decks (25 cards across 5 decks)
// =============================================================================

const BUILT_IN_DECKS: FlashcardDeck[] = [
  {
    id: 'general',
    name: 'General Medicine',
    icon: '⚕️',
    cards: [
      { front: 'What are normal adult vital signs?', back: 'HR: 60-100 bpm | BP: <120/<80 mmHg | RR: 12-20 breaths/min | Temp: 36.1-37.2°C (97-99°F) | SpO2: 95-100% | Pain: 0-10 scale' },
      { front: 'What are the BMI categories (WHO)?', back: 'Underweight: <18.5 | Normal: 18.5-24.9 | Overweight: 25-29.9 | Obese Class I: 30-34.9 | Obese Class II: 35-39.9 | Obese Class III: ≥40' },
      { front: 'How do you assess dehydration severity?', back: 'Mild (3-5%): Thirst, slightly dry mucous membranes | Moderate (6-9%): Tachycardia, decreased skin turgor, oliguria, sunken eyes | Severe (>10%): Hypotension, altered consciousness, no urine output, shock.' },
      { front: 'What are the 4 types of shock?', back: '1. Hypovolemic: blood/fluid loss 2. Cardiogenic: pump failure 3. Distributive: vasodilation (sepsis, anaphylaxis, neurogenic) 4. Obstructive: physical obstruction (tension pneumothorax, PE, tamponade)' },
      { front: 'What are the Acid-Base disorders and their compensation?', back: 'Metabolic Acidosis: ↓pH, ↓HCO3-, compensate with ↑RR | Metabolic Alkalosis: ↑pH, ↑HCO3-, compensate with ↓RR | Respiratory Acidosis: ↓pH, ↑PCO2, compensate with ↑HCO3- | Respiratory Alkalosis: ↑pH, ↓PCO2, compensate with ↓HCO3-' },
      { front: 'What are the causes of high anion gap metabolic acidosis (HAGMA)?', back: 'MUDPILES: Methanol, Uremia, DKA/alcoholic ketoacidosis, Propylene glycol, Isoniazid/Iron, Lactic acidosis, Ethylene glycol, Salicylates.' },
      { front: 'What is the normal anion gap and its formula?', back: 'AG = Na+ - (Cl- + HCO3-); normal 8-12 mEq/L. In HAGMA, also compute the delta-delta gap (ΔAG/ΔHCO3) to detect a concurrent metabolic alkalosis or a mixed NAGMA.' },
      { front: 'What is the Winter formula?', back: 'Expected PaCO2 = 1.5 × HCO3 + 8 (±2). Assesses respiratory compensation in metabolic acidosis. Measured PaCO2 higher than predicted → concurrent respiratory acidosis; lower → respiratory alkalosis.' },
      { front: 'What are the causes and treatment of hyponatremia?', back: 'Causes: SIADH, hypovolemia, hypervolemia (HF, cirrhosis), adrenal insufficiency, hypothyroidism, drugs. Acute severe (seizures): hypertonic saline. Correct by ≤8-10 mEq/L per day — rapid correction causes central pontine myelinolysis.' },
      { front: 'What are the causes and treatment of hypernatremia?', back: 'Causes: water loss (diabetes insipidus, insensible loss, osmotic diuresis), poor intake, hypertonic saline. Free water deficit = 0.6 × weight × (Na/140 - 1). Replace slowly and treat the underlying cause.' },
      { front: 'What are the causes, ECG, and treatment of hypokalemia?', back: 'Causes: diuretics, vomiting, diarrhea, aldosterone excess, alkalosis. ECG: flat/inverted T waves, U waves, ST depression, arrhythmias. Treatment: PO/IV potassium (never IV push). Hypokalemia precipitates digoxin toxicity.' },
      { front: 'List the common causes of hyperkalemia.', back: 'Renal failure, ACEi/ARB, K-sparing diuretics, cell lysis (rhabdomyolysis, tumor lysis), metabolic acidosis, Addison disease, excessive K+ intake, pseudohyperkalemia (hemolysis). ECG: peaked T waves then wide QRS.' },
      { front: 'What are the signs of hypocalcemia?', back: 'Perioral tingling, carpopedal spasm, Chvostek sign (facial twitch on tapping the nerve), Trousseau sign (carpal spasm with a BP cuff), tetany, seizures, prolonged QT. Causes: hypoparathyroidism, vitamin D deficiency, CKD, pancreatitis.' },
      { front: 'What are the causes and treatment of hypercalcemia?', back: 'Causes: HOMES — Hyperparathyroidism, Malignancy (PTHrP), Multiple myeloma, Endocrine, Sarcoidosis/Supplements. Features: stones, bones, moans, groans (renal stones, bone pain, depression, constipation). Treatment: IV fluids, calcitonin, bisphosphonates.' },
      { front: 'What are the symptoms and treatment of hypoglycemia?', back: 'Autonomic: sweating, tremor, palpitations, hunger. Neuroglycopenic: confusion, seizure, coma. Treatment: Rule of 15 — 15 g fast carbs, recheck in 15 min; if unconscious, IV dextrose or IM glucagon.' },
      { front: 'What are the ADA diagnostic criteria for diabetes?', back: 'Any one: fasting glucose ≥126 mg/dL, random glucose ≥200 with symptoms, HbA1c ≥6.5%, or 2-h OGTT glucose ≥200 after 75 g. A second abnormal test confirms the diagnosis.' },
      { front: 'What are the features and treatment of DKA?', back: 'Hyperglycemia (>250 mg/dL), ketonemia, high anion gap acidosis, dehydration, Kussmaul breathing, fruity breath. Treatment: IV fluids (normal saline), insulin infusion (once K+ >3.3), potassium replacement, and treat the precipitant.' },
      { front: 'What is HHS and how does it differ from DKA?', back: 'Hyperosmolar hyperglycemic state: glucose >600, extreme dehydration, minimal ketosis/acidosis, marked hyperosmolality; elderly type 2 diabetics. Treatment: fluids and insulin; higher thrombosis and hypokalemia risk — correct more slowly than DKA.' },
      { front: 'What are the features of hypothyroidism versus hyperthyroidism?', back: 'Hypo: fatigue, cold intolerance, weight gain, constipation, bradycardia, coarse skin/hair, myxedema. Hyper: heat intolerance, weight loss, tremor, tachycardia, diarrhea, anxiety, and exophthalmos in Graves disease.' },
      { front: 'What is thyroid storm and its treatment?', back: 'Life-threatening hyperthyroidism: fever, tachycardia, agitation, delirium, vomiting. Treatment: beta-blocker (propranolol), thionamide, iodine (only AFTER thionamide), corticosteroids, cooling, and treat the precipitant (infection).' },
      { front: 'What are the features of Addison disease (adrenal insufficiency)?', back: 'Weakness, fatigue, weight loss, hyperpigmentation (skin and creases), hyponatremia, hyperkalemia, hypotension/shock, salt craving. Treatment: glucocorticoid + mineralocorticoid replacement, with stress-dose steroids during illness.' },
      { front: 'What are the features of Cushing syndrome?', back: 'Central obesity, moon facies, buffalo hump, purple abdominal striae, easy bruising, proximal myopathy, hyperglycemia, HTN, osteoporosis, hirsutism. Causes: exogenous steroids, adrenal adenoma, pituitary adenoma (Cushing disease), ectopic ACTH.' },
      { front: 'What are the features of pheochromocytoma?', back: 'Episodic: hypertension, headache, palpitations, sweating, pallor. Rule of 10s: 10% bilateral, malignant, extra-adrenal, familial. Diagnosis: plasma/urinary metanephrines. Pre-op: alpha-blockade FIRST (phenoxybenzamine), then beta-blockade — never beta first.' },
      { front: 'What are the causes of acute kidney injury (AKI)?', back: 'Pre-renal: hypovolemia, sepsis, heart failure (BUN:Cr >20, improves with fluids). Intra-renal: ATN (ischemia, nephrotoxins), glomerulonephritis, interstitial nephritis. Post-renal: obstruction (stones, BPH, tumor).' },
      { front: 'What are the qSOFA criteria and the initial sepsis management?', back: 'qSOFA: altered mentation, RR ≥22, SBP ≤100 — ≥2 points suggests sepsis. First hour: lactate, blood cultures BEFORE antibiotics, broad-spectrum antibiotics, IV fluids 30 mL/kg if hypotensive or high lactate, norepinephrine if refractory.' },
      { front: 'What is anaphylaxis and its treatment?', back: 'Rapid onset: urticaria/angioedema, bronchospasm, hypotension, nausea. Treatment: IM epinephrine (0.3-0.5 mg anterolateral thigh) FIRST, repeat q5-15 min. Adjuncts: oxygen, IV fluids, antihistamines, steroids; observe 4-6 h.' },
      { front: 'How do heat exhaustion and heat stroke differ?', back: 'Heat exhaustion: fatigue, sweating, tachycardia, normal mentation, core <40°C — fluids and cooling. Heat stroke: core >40°C with CNS dysfunction (confusion, coma) and hot dry skin — EMERGENCY: rapid cooling (ice water immersion) and IV fluids.' },
      { front: 'What are the types of acute transfusion reactions?', back: 'Acute hemolytic (ABO mismatch: fever, flank pain, DIC — stop and support), Febrile non-hemolytic (most common), Allergic (urticaria), Anaphylactic (IgA deficiency), TRALI (ARDS within 6 h), TACO (volume overload).' },
      { front: 'What are the causes of microcytic versus macrocytic anemia?', back: 'Microcytic (low MCV): iron deficiency, thalassemia, sideroblastic, chronic disease (can be normocytic). Macrocytic (high MCV): B12/folate deficiency, alcohol, liver disease, hypothyroidism, drugs (methotrexate), reticulocytosis.' },
      { front: 'What are the causes of upper GI bleeding and its initial management?', back: 'Causes: peptic ulcer, esophageal varices, Mallory-Weiss tear, esophagitis, cancer. Initial: ABC, two large-bore IVs, fluid resuscitation, cross-match/transfuse, IV PPI, and for suspected varices octreotide + antibiotics; urgent endoscopy.' },
      { front: 'What is DIC and how is it managed?', back: 'Disseminated intravascular coagulation: consumption of platelets and clotting factors causing bleeding plus microthrombosis. Causes: sepsis, obstetric complications, malignancy, trauma. Labs: ↓ platelets, ↑ PT/INR, ↓ fibrinogen, ↑ D-dimer. Treatment: treat the cause, replace factors/platelets if bleeding.' },
      { front: 'What is febrile neutropenia and its management?', back: 'Temperature ≥38.3°C (or ≥38.0°C for >1 h) with ANC <500/mm3, typically post-chemotherapy. Management: blood cultures, urgent broad-spectrum IV antibiotics within 1 hour (anti-pseudomonal: piperacillin-tazobactam or cefepime), G-CSF selectively.' },
    ],
  },
  {
    id: 'cardiovascular',
    name: 'Cardiovascular',
    icon: '🫀',
    cards: [
      { front: 'What is a normal resting heart rate?', back: '60-100 beats per minute (bpm). Athletes may have lower rates (40-60 bpm).' },
      { front: 'What are the BP categories (ACC/AHA)?', back: 'Normal: <120/<80 | Elevated: 120-129/<80 | Stage 1 HTN: 130-139/80-89 | Stage 2 HTN: ≥140/≥90 | Hypertensive crisis: >180/>120' },
      { front: 'What are the classic symptoms of MI (STEMI)?', back: 'Crushing substernal chest pain radiating to left arm/jaw, diaphoresis, nausea/vomiting, dyspnea, palpitations, sense of impending doom.' },
      { front: 'What are the stages of Heart Failure (ACC/AHA)?', back: 'Stage A: At risk, no symptoms | Stage B: Structural disease, no symptoms | Stage C: Structural disease with symptoms | Stage D: Refractory HF requiring advanced interventions' },
      { front: 'Name 5 common cardiac arrhythmias', back: '1. Atrial fibrillation 2. Atrial flutter 3. Ventricular tachycardia 4. Ventricular fibrillation 5. Supraventricular tachycardia (SVT)' },
      { front: 'How do you distinguish a systolic from a diastolic heart murmur?', back: 'Systolic: occurs between S1 and S2 (e.g., aortic stenosis, mitral regurgitation, VSD). Diastolic: occurs between S2 and S1 and is ALWAYS pathological (e.g., aortic regurgitation, mitral stenosis).' },
      { front: 'Describe the murmur of aortic stenosis (AS).', back: 'Crescendo-decrescendo systolic ejection murmur, best heard at the right upper sternal border, radiating to the carotids. Associated: pulsus parvus et tardus, S4, LVH. Causes: calcific, bicuspid valve, rheumatic.' },
      { front: 'Describe the murmur of mitral regurgitation (MR).', back: 'Holosystolic (pansystolic) murmur at the apex, radiating to the axilla. Causes: mitral valve prolapse, rheumatic disease, LV dilation, papillary muscle dysfunction or rupture after MI.' },
      { front: 'Describe the murmur of aortic regurgitation (AR).', back: 'Early diastolic decrescendo murmur at the left sternal border, best heard leaning forward in expiration. Associated: water-hammer (Corrigan) pulse, wide pulse pressure, Austin Flint murmur. Causes: rheumatic, endocarditis, aortic root dilation.' },
      { front: 'Describe the murmur of mitral stenosis (MS).', back: 'Diastolic rumble with an opening snap, best heard at the apex in the left lateral decubitus position. Most common cause: rheumatic fever. Associated: atrial fibrillation, LA enlargement, pulmonary hypertension.' },
      { front: 'Which murmur gets louder with Valsalva and why?', back: 'Hypertrophic cardiomyopathy (HCM): Valsalva decreases preload, narrowing the LV outflow tract, so the systolic murmur gets LOUDER. AS, MR and VSD murmurs typically get quieter.' },
      { front: 'What is the most common cause of isolated right-sided heart failure?', back: 'Cor pulmonale: right ventricular failure due to pulmonary hypertension, most often from COPD. Overall, left heart failure is the most common cause of RV failure. Other causes: massive PE, primary pulmonary hypertension.' },
      { front: 'Which leads show an acute inferior STEMI and which artery is involved?', back: 'ST elevation in leads II, III, aVF (right coronary artery). Consider a concurrent RV infarct: do a right-sided ECG (V4R) and avoid nitrates in inferior + RV infarction.' },
      { front: 'What are the ECG features of left bundle branch block (LBBB)?', back: 'QRS ≥120 ms, no Q waves, broad notched (M-shaped) R wave in I, V5, V6, deep S in V1, ST/T discordance. New LBBB with chest pain = treat as STEMI until proven otherwise.' },
      { front: 'What are the ECG features of right bundle branch block (RBBB)?', back: 'QRS ≥120 ms with rSR pattern (rabbit ears) in V1-V2 and a slurred S wave in I and V6. Causes: PE, ischemia, congenital heart disease; often a benign finding in young athletes.' },
      { front: 'What are the ECG features and management of atrial fibrillation?', back: 'ECG: irregularly irregular rhythm, no P waves, variable R-R intervals. Management: rate control (beta-blocker or non-DHP CCB), rhythm control, and anticoagulation based on the CHA2DS2-VASc score.' },
      { front: 'What are the ECG features of Wolff-Parkinson-White (WPW) syndrome?', back: 'Short PR (<120 ms), slurred QRS upstroke (delta wave), wide QRS. Risk: AVRT and AF with rapid conduction. In AF with WPW, AVOID AV nodal blockers (verapamil, digoxin) — they worsen conduction.' },
      { front: 'What is complete heart block (third-degree AV block) and its management?', back: 'Complete AV dissociation: P waves and QRS complexes are independent, with bradycardia and a wide escape rhythm. Causes: ischemia, AV nodal disease, drugs. Treatment: atropine (often fails), transcutaneous pacing, then permanent pacemaker.' },
      { front: 'How do you define STEMI, NSTEMI, and unstable angina?', back: 'STEMI: ST elevation plus troponin rise. NSTEMI: troponin rise without ST elevation. Unstable angina: typical symptoms without troponin rise. All three fall under acute coronary syndrome (ACS).' },
      { front: 'What is the acute management of a STEMI?', back: 'MONA plus reperfusion: oxygen (if hypoxic), aspirin 300 mg chewed, nitrates, morphine, plus primary PCI within 90 minutes (or fibrinolysis within 30 min if PCI unavailable), DAPT, anticoagulant, and a high-intensity statin.' },
      { front: 'What is DAPT and who needs it after ACS?', back: 'Dual antiplatelet therapy: aspirin plus a P2Y12 inhibitor (clopidogrel, ticagrelor, or prasugrel). Given for at least 12 months after ACS (± stenting) to prevent stent thrombosis and recurrent events.' },
      { front: 'List the common complications of myocardial infarction.', back: 'Early: arrhythmias (VT/VF), cardiogenic shock, papillary muscle rupture causing MR, free wall rupture (tamponade), ventricular septal defect. Late: Dressler pericarditis, LV aneurysm, mural thrombus with embolization, heart failure.' },
      { front: 'How does HFrEF differ from HFpEF?', back: 'HFrEF: ejection fraction ≤40% — systolic pump failure, has proven disease-modifying therapy. HFpEF: EF ≥50% — diastolic dysfunction (HTN, LVH, elderly); treatment is diuretics + SGLT2i + managing comorbidities.' },
      { front: 'What are the four pillars of guideline-directed therapy for HFrEF?', back: '1) ARNI (or ACEi/ARB), 2) evidence-based beta-blocker (carvedilol, metoprolol succinate, bisoprolol), 3) mineralocorticoid receptor antagonist, 4) SGLT2 inhibitor (dapagliflozin/empagliflozin).' },
      { front: 'What is cardiogenic shock and how is it managed?', back: 'Persistent hypotension with end-organ hypoperfusion despite adequate filling, due to pump failure (large MI, fulminant myocarditis). Management: norepinephrine + inotropes, urgent revascularization, and mechanical support (IABP, Impella, VA-ECMO).' },
      { front: 'What are the key features of hypertrophic cardiomyopathy (HCM)?', back: 'Autosomal dominant sarcomeric mutation. Features: exertional dyspnea/syncope, LV hypertrophy without dilation, outflow murmur louder with Valsalva, sudden cardiac death risk (VT). Screen with ECG/echo; restrict intense exercise.' },
      { front: 'What are the modified Duke criteria for infective endocarditis?', back: 'Major: typical organisms on 2 blood cultures, or endocardial involvement on echo. Minor: fever, predisposing condition, vascular/immunologic phenomena. Definite: 2 major, 1 major + 3 minor, or 5 minor.' },
      { front: 'Which patients need infective endocarditis prophylaxis before dental work?', back: 'Only highest-risk patients: prosthetic heart valve, previous IE, unrepaired cyanotic congenital heart disease, or cardiac transplant valvulopathy. Prophylaxis: amoxicillin 2 g before the procedure.' },
      { front: 'How does pericarditis pain differ from MI pain?', back: 'Pericarditis: sharp, pleuritic, positional (worse supine, better leaning forward), with a friction rub; ECG shows diffuse ST elevation and PR depression (not coronary distribution). MI: pressure-type exertional pain with regional ECG changes.' },
      { front: 'What is cardiac tamponade and how is it treated?', back: 'Pericardial fluid compressing the heart. Beck triad: hypotension, muffled heart sounds, distended neck veins. ECG: low voltage with electrical alternans. Treatment: urgent echo-guided pericardiocentesis; IV fluids to maintain preload first.' },
      { front: 'What are the features and management of aortic dissection?', back: 'Risk factors: hypertension, Marfan syndrome, bicuspid aortic valve. Features: abrupt tearing chest/back pain, unequal arm BPs, aortic regurgitation, wide mediastinum. Management: beta-blocker first, then BP control; urgent surgery for type A (ascending).' },
      { front: 'What is a hypertensive emergency versus a hypertensive urgency?', back: 'Emergency: BP >180/120 with acute end-organ damage (stroke, MI, AKI, papilledema) — IV antihypertensives, lower MAP ~20-25% in the first hour. Urgency: severely elevated BP WITHOUT end-organ damage — oral agents, no immediate crisis.' },
      { front: 'What are the ECG changes and treatment of hyperkalemia?', back: 'ECG: peaked T waves, PR prolongation, loss of P waves, wide QRS, sine wave, then VF/asystole. Treatment: IV calcium gluconate (membrane stabilizer), insulin + glucose, beta-2 agonist, sodium bicarbonate, then K+ removal (loop diuretic, binders, dialysis).' },
      { front: 'What are the features and treatment of digoxin toxicity?', back: 'Features: nausea, visual disturbances (yellow-green halos), bradyarrhythmias, atrial tachycardia with AV block. Risk factors: hypokalemia, renal failure, drug interactions (amiodarone). Treatment: stop digoxin, correct potassium, digoxin immune Fab.' },
      { front: 'What are the 5 Hs and 5 Ts of pulseless electrical activity (PEA)?', back: 'Hs: Hypovolemia, Hypoxia, Hydrogen ion (acidosis), Hypo/hyperkalemia, Hypothermia. Ts: Tension pneumothorax, cardiac Tamponade, Thrombosis (MI/PE), Toxins, Trauma.' },
      { front: 'How is ventricular fibrillation or pulseless VT managed?', back: 'High-quality CPR with immediate defibrillation, epinephrine 1 mg every 3-5 min, amiodarone 300 mg (then 150 mg) after the 3rd shock, and treat reversible causes (Hs and Ts).' },
    ],
  },
  {
    id: 'respiratory',
    name: 'Respiratory',
    icon: '🫁',
    cards: [
      { front: 'What are the normal lung volumes and capacities?', back: 'Tidal Volume: ~500mL | Inspiratory Reserve: ~3000mL | Expiratory Reserve: ~1100mL | Residual Volume: ~1200mL | Vital Capacity: ~4600mL | Total Lung Capacity: ~6000mL' },
      { front: 'What are the 4 types of pneumonia classification?', back: '1. Community-Acquired (CAP) 2. Hospital-Acquired (HAP) 3. Ventilator-Associated (VAP) 4. Aspiration pneumonia. Also by pathogen: bacterial, viral, fungal.' },
      { front: 'How do COPD and Asthma differ?', back: 'Asthma: Reversible, early onset, atopy common, eosinophilic, variable airflow limitation. COPD: Irreversible/progressive, late onset, smoking history, neutrophilic, persistent airflow limitation.' },
      { front: 'What are the classic signs of Pulmonary Embolism?', back: 'Sudden dyspnea, pleuritic chest pain, tachycardia, tachypnea, hemoptysis, hypoxia, anxiety. Signs of DVT in legs. RV strain on ECG (S1Q3T3).' },
      { front: 'What are the types of Respiratory Failure?', back: 'Type I (Hypoxemic): Low PaO2 (<60mmHg), normal/low PaCO2. Type II (Hypercapnic): High PaCO2 (>50mmHg) with/without hypoxemia. Most common cause of Type II is COPD.' },
      { front: 'How do you distinguish obstructive from restrictive lung disease on spirometry?', back: 'Obstructive: ↓FEV1/FVC ratio (<0.70), ↓FEV1, air trapping (↑RV/TLC). Restrictive: ↓FVC with normal or increased FEV1/FVC ratio, ↓TLC (e.g., ILD, neuromuscular disease).' },
      { front: 'What are the normal ABG values?', back: 'pH 7.35-7.45 | PaCO2 35-45 mmHg | HCO3 22-26 mEq/L | PaO2 80-100 mmHg | Base excess -2 to +2 | SpO2 ~95-100%.' },
      { front: 'How do you systematically interpret an ABG?', back: 'R.O.M.E.: Respiratory is Opposite (high CO2 = low pH), Metabolic is Equal (high HCO3 = high pH). Then check compensation and calculate the anion gap if metabolic acidosis is present.' },
      { front: 'What are the main causes of respiratory acidosis?', back: 'Hypoventilation: CNS depression (opioids, sedatives), neuromuscular disease (GBS, myasthenia), airway obstruction, COPD, chest wall disease, obesity hypoventilation. Compensation: renal retention of HCO3 (slow).' },
      { front: 'What are the causes of respiratory alkalosis?', back: 'Hyperventilation: anxiety, pain, hypoxia, pulmonary embolism, salicylate toxicity (early), hepatic failure, pregnancy, high altitude. Compensation: renal loss of HCO3. Treatment: treat the cause; rebreathing for anxiety.' },
      { front: 'How is asthma treated in steps?', back: 'Step 1: SABA as needed. Step 2: low-dose ICS. Step 3: low-dose ICS + LABA. Step 4: medium-dose ICS + LABA. Step 5: high-dose ICS + LABA plus add-ons (tiotropium, biologics).' },
      { front: 'What are the features of status asthmaticus?', back: 'Severe asthma unresponsive to bronchodilators: silent chest, PEF <50% predicted, normal or rising PaCO2 (ominous sign of fatigue), pulsus paradoxus, cyanosis. Treatment: O2, repeated inhaled bronchodilators, IV steroids, magnesium, NIV or intubation.' },
      { front: 'What is the GOLD definition of COPD?', back: 'Persistent airflow limitation confirmed by a post-bronchodilator FEV1/FVC ratio <0.70. The obstruction is progressive and not fully reversible; the main risk factor is smoking.' },
      { front: 'How do you manage an acute COPD exacerbation?', back: 'O2 titrated to SpO2 88-92%, inhaled short-acting bronchodilators (SABA + SAMA), systemic corticosteroids, antibiotics for purulent sputum, NIV (BiPAP) for hypercapnic respiratory failure, and treat the precipitant.' },
      { front: 'What are the types of pneumothorax and their treatment?', back: 'Primary spontaneous: tall thin young males, apical blebs — small: observation; large/symptomatic: aspiration or chest drain. Secondary: with underlying lung disease. Tension: emergency needle decompression + chest tube.' },
      { front: 'What are the features and immediate treatment of tension pneumothorax?', back: 'Features: severe dyspnea, tracheal deviation AWAY from the affected side, absent breath sounds, hyperresonance, hypotension, distended neck veins. Treatment: immediate needle decompression (2nd intercostal space midclavicular line), then chest tube.' },
      { front: 'What are Light criteria for an exudative pleural effusion?', back: 'Exudate if any one: pleural/serum protein ratio >0.5, pleural/serum LDH ratio >0.6, or pleural LDH >2/3 of the serum upper limit. Transudates: CHF, cirrhosis, nephrotic syndrome. Exudates: infection, malignancy, PE, TB, pancreatitis.' },
      { front: 'What are the Wells criteria for pulmonary embolism?', back: 'Items: clinical DVT, HR >100, immobilization or recent surgery, previous DVT/PE, hemoptysis, malignancy, PE most likely diagnosis. Scores: low (<2), moderate (2-6), high (>6). Guides D-dimer testing versus CTPA.' },
      { front: 'What is the treatment of acute pulmonary embolism?', back: 'Anticoagulation (LMWH or DOAC; UFH if hemodynamically unstable). Massive PE with shock: thrombolysis or surgical/mechanical embolectomy. Submassive PE: anticoagulation, with selective thrombolysis.' },
      { front: 'What is the CURB-65 score and when is it used?', back: 'CURB-65: Confusion, Urea >7 mmol/L, RR ≥30, BP <90/≤60 mmHg, age ≥65. Score 0-1: outpatient. 2: hospital admission. ≥3: severe — ICU. Used for CAP severity and site-of-care decisions.' },
      { front: 'How does primary tuberculosis differ from reactivation TB?', back: 'Primary: usually lower/middle lobes, subpleural Ghon focus, often asymptomatic or flu-like. Reactivation: upper lobe apical disease (oxygen-rich), cavitation, hemoptysis, fever, night sweats, weight loss.' },
      { front: 'What is the standard treatment regimen for pulmonary TB?', back: 'RIPE: Rifampin, Isoniazid, Pyrazinamide, Ethambutol for 2 months, then Rifampin + Isoniazid for 4 months (total 6 months). Latent TB: isoniazid for 9 months (or a rifampin-based regimen).' },
      { front: 'What are the classic features of sarcoidosis?', back: 'Bilateral hilar lymphadenopathy, erythema nodosum, uveitis, restrictive lung disease, elevated ACE, hypercalcemia, non-caseating granulomas. Most common in Black women. Stage 1: hilar lymphadenopathy only.' },
      { front: 'What are the paraneoplastic syndromes of lung cancer?', back: 'Small cell: SIADH (hyponatremia), ACTH (Cushing), Lambert-Eaton syndrome. Squamous cell: hypercalcemia (PTHrP). Large cell: gynecomastia (hCG). Pancoast (apical) tumor: Horner syndrome + shoulder/arm pain.' },
      { front: 'What are the key features of cystic fibrosis?', back: 'Autosomal recessive CFTR mutation. Features: chronic cough, recurrent infections (S. aureus, P. aeruginosa), pancreatic insufficiency, elevated sweat chloride, male infertility (absent vas deferens), clubbing.' },
      { front: 'What are the 4 causes of hypoxemia and how do you distinguish them?', back: '1) Hypoventilation: ↑PaCO2, normal A-a gradient. 2) V/Q mismatch: normal A-a gradient, improves with O2. 3) Diffusion impairment: widened A-a gradient, worse with exercise. 4) Shunt: does NOT improve with 100% O2.' },
      { front: 'What is ARDS and the Berlin criteria?', back: 'Acute (≤7 days) bilateral pulmonary infiltrates not due to heart failure or fluid overload, with PaO2/FiO2: mild 200-300, moderate 100-200, severe <100. Treatment: lung-protective ventilation (tidal volume 4-6 mL/kg), treat the cause.' },
      { front: 'How do obstructive and central sleep apnea differ?', back: 'Obstructive: airway collapse despite respiratory effort (snoring, daytime somnolence, obesity). Central: no respiratory effort (brain fails to drive breathing; Cheyne-Stokes in heart failure). Diagnosis: polysomnography. OSA: CPAP, weight loss.' },
      { front: 'What is the difference between wheezing and stridor?', back: 'Wheeze: high-pitched musical sound mainly on expiration, from lower airway narrowing (asthma, COPD). Stridor: harsh inspiratory sound from upper airway obstruction (croup, epiglottitis, foreign body) — an emergency.' },
      { front: 'What are the indications and contraindications for NIV?', back: 'Indications: acute hypercapnic respiratory failure (COPD), cardiogenic pulmonary edema (CPAP), obesity hypoventilation. Contraindications: coma, hemodynamic instability, facial trauma, vomiting, inability to protect the airway.' },
      { front: 'What is massive hemoptysis and how is it managed?', back: 'Hemoptysis >200-600 mL/24h (or rapid bleeding with instability). Causes: TB, bronchiectasis, lung cancer, aspergilloma. Management: protect the airway (intubate, position bleeding lung down), reverse coagulopathy, bronchoscopy/bronchial artery embolization, definitive surgery.' },
    ],
  },
  {
    id: 'neuro',
    name: 'Neurology',
    icon: '🧠',
    cards: [
      { front: 'List the 12 Cranial Nerves (mnemonic: "Oh Oh Oh, To Touch And Feel Very Good Velvet, AH!")', back: 'I-Olfactory, II-Optic, III-Oculomotor, IV-Trochlear, V-Trigeminal, VI-Abducens, VII-Facial, VIII-Vestibulocochlear, IX-Glossopharyngeal, X-Vagus, XI-Accessory, XII-Hypoglossal' },
      { front: 'What does the FAST acronym mean in Stroke?', back: 'F-Face drooping | A-Arm weakness | S-Speech difficulty | T-Time to call emergency. Additional: BE-FAST adds Balance and Eyes.' },
      { front: 'What is the Glasgow Coma Scale (GCS)?', back: 'Eye Opening (1-4) + Verbal Response (1-5) + Motor Response (1-6) = 3-15. Mild: 13-15, Moderate: 9-12, Severe: 3-8.' },
      { front: 'What is the classic meningitis triad?', back: '1. Fever 2. Nuchal rigidity (neck stiffness) 3. Altered mental status. Also: headache, photophobia, nausea/vomiting, positive Kernig and Brudzinski signs.' },
      { front: 'What are the main seizure types?', back: 'Focal (partial): Simple (aware) or Complex (impaired awareness). Generalized: Tonic-clonic, Absence, Myoclonic, Atonic, Tonic, Clonic. Also: Status epilepticus (prolonged seizure).' },
      { front: 'Which cranial nerves control eye movements and the pupil?', back: 'CN III (oculomotor): most extraocular muscles, levator, pupillary constriction (PSNS). CN IV (trochlear): superior oblique (depresses adducted eye). CN VI (abducens): lateral rectus (abduction). CN III palsy: down-and-out eye with a blown pupil.' },
      { front: 'How do you distinguish Bell palsy from stroke facial weakness?', back: 'Bell palsy (LMN): the whole side of the face is weak — forehead involved, ear pain, hyperacusis. Stroke (UMN): forehead is spared (upper face intact), with other deficits such as limb weakness or aphasia.' },
      { front: 'What are the features of ischemic versus hemorrhagic stroke?', back: 'Ischemic (85%): abrupt focal deficit; risk factors: atherosclerosis, atrial fibrillation. Hemorrhagic: headache, vomiting, decreased consciousness, rapid progression; HTN or anticoagulation. Imaging: CT shows hemorrhage as white; MRI for ischemia.' },
      { front: 'How do thrombotic and embolic stroke differ?', back: 'Thrombotic: in-situ clot on atherosclerosis, often preceded by TIAs, at bifurcations. Embolic: from the heart (AF, valve, endocarditis) or carotid — sudden maximal deficit, can involve multiple territories, higher hemorrhagic conversion risk.' },
      { front: 'What is a TIA and how is it evaluated?', back: 'Transient (<24 h, usually <1 h) focal neurologic deficit from ischemia without infarction. Evaluate urgently: CT/MRI, carotid imaging, ECG/holter for AF, labs. Treat with antiplatelets and risk-factor modification.' },
      { front: 'What is the time window and criteria for IV thrombolysis in ischemic stroke?', back: 'IV rtPA (alteplase/tenecteplase) within 4.5 hours of symptom onset (0.9 mg/kg). Mechanical thrombectomy for large vessel occlusion can be offered up to 24 h in selected patients based on perfusion imaging.' },
      { front: 'What are the contraindications to IV thrombolysis?', back: 'Active bleeding, recent major surgery or head trauma, GI/GU bleed within 21 days, INR >1.7, platelets <100,000, uncontrolled BP >185/110, prior stroke within 3 months, current DOAC use, suspected aortic dissection.' },
      { front: 'What are the CSF findings in bacterial versus viral meningitis?', back: 'Bacterial: ↑↑ WBC (PMN predominant), ↓ glucose, ↑ protein, high opening pressure. Viral: lymphocytic pleocytosis, normal glucose, mildly elevated protein. TB: lymphocytic, very low glucose, very high protein.' },
      { front: 'What is the empirical treatment of acute bacterial meningitis?', back: 'Dexamethasone (before or with the first antibiotic) + Ceftriaxone + Vancomycin. Add ampicillin (Listeria coverage) in patients <3 months, >50 years, or immunocompromised.' },
      { front: 'What are the features and treatment of HSV encephalitis?', back: 'Features: fever, headache, altered consciousness, focal seizures, temporal lobe involvement (hemorrhagic necrosis). CSF: lymphocytic pleocytosis with red cells. Treatment: IV acyclovir started empirically — do not wait for PCR.' },
      { front: 'How is status epilepticus managed?', back: 'ABCs and check glucose. 1) Benzodiazepine (IV lorazepam or IM midazolam) 2) Second-line: fosphenytoin, levetiracetam, or valproate 3) Third-line: anesthetics (propofol or midazolam infusion) with EEG monitoring. Treat the underlying cause.' },
      { front: 'What are the first-line AEDs for focal versus generalized seizures?', back: 'Focal: levetiracetam, lamotrigine, carbamazepine, phenytoin. Generalized tonic-clonic: valproate, levetiracetam, lamotrigine. Absence: ethosuximide or valproate. Avoid carbamazepine in absence/myoclonic seizures (worsens them).' },
      { front: 'What are the features of absence seizures?', back: 'Brief (5-10 s) staring spells with eyelid fluttering, no aura or post-ictal state, provoked by hyperventilation. EEG: 3 Hz spike-and-wave. Children. First-line: ethosuximide (or valproate).' },
      { front: 'What are the cardinal features of Parkinson disease?', back: 'TRAP: Tremor (resting, pill-rolling), Rigidity (cogwheel), Akinesia/bradykinesia, Postural instability. Also: masked face, shuffling gait, micrographia. Treatment: carbidopa-levodopa, dopamine agonists, MAO-B inhibitors.' },
      { front: 'Which drugs cause drug-induced parkinsonism?', back: 'Dopamine blockers: antipsychotics (haloperidol), antiemetics (metoclopramide, prochlorperazine), reserpine, tetrabenazine. Usually reversible after stopping the offending drug.' },
      { front: 'What are the features and treatment of multiple sclerosis?', back: 'Young women, CNS demyelination separated in time and space. Features: optic neuritis, Uththoff phenomenon (heat worsens), internuclear ophthalmoplegia, Lhermitte sign. Acute relapse: steroids. Prevention: disease-modifying therapy (interferons, glatiramer, natalizumab).' },
      { front: 'What are the features and treatment of myasthenia gravis?', back: 'Autoantibodies to the ACh receptor; fatigable weakness (ptosis, diplopia, proximal muscles) that improves with rest. Tests: ice pack, edrophonium (Tensilon), anti-AChR antibodies. Treatment: pyridostigmine, steroids, thymectomy if thymoma.' },
      { front: 'What are the features and treatment of Guillain-Barré syndrome?', back: 'Ascending symmetric weakness after infection (Campylobacter), areflexia, autonomic instability; CSF shows albuminocytologic dissociation (high protein, normal cells). Treatment: IVIG or plasmapheresis; monitor respiratory function (NIF/VC).' },
      { front: 'What are the features of amyotrophic lateral sclerosis (ALS)?', back: 'Combined UMN signs (spasticity, hyperreflexia, Babinski) and LMN signs (weakness, atrophy, fasciculations), NO sensory loss, with bulbar involvement (dysphagia, dysarthria). Progressive and fatal; riluzole offers modest benefit.' },
      { front: 'What is trigeminal neuralgia and its first-line treatment?', back: 'Severe lancinating paroxysmal facial pain (V2/V3), triggered by touch, wind, or eating, with a normal exam. First-line: carbamazepine (or oxcarbazepine). Causes: vascular compression, MS, tumor.' },
      { front: 'How is Bell palsy treated?', back: 'Oral prednisone within 72 hours improves recovery; eye protection (lubrication, patch). Add antivirals in severe cases or Ramsay Hunt syndrome (zoster). Most patients recover fully.' },
      { front: 'What are the features of subarachnoid hemorrhage?', back: 'Thunderclap (worst-ever) headache, often a sentinel headache, neck stiffness, vomiting, decreased consciousness. Causes: ruptured berry aneurysm (80%). CT within 6 h is highly sensitive; then LP for xanthochromia. Watch for vasospasm (days 4-14).' },
      { front: 'How do epidural and subdural hematoma differ?', back: 'Epidural: arterial (middle meningeal), after trauma with a lucid interval, lentiform shape on CT, does NOT cross suture lines. Subdural: venous (bridging veins), elderly/anticoagulation, often chronic, crescent shape, crosses sutures.' },
      { front: 'What is Cushing triad of increased intracranial pressure?', back: '1) Hypertension, 2) Bradycardia, 3) Irregular respirations (Cushing reflex). A late sign of impending herniation. Management: head elevation, mannitol or hypertonic saline, hyperventilation, urgent decompressive surgery.' },
      { front: 'How do you differentiate delirium from dementia?', back: 'Delirium: acute onset, fluctuating course, inattention, hallucinations; reversible — often triggered by infection, drugs, or metabolic disturbance in the elderly. Dementia: chronic progressive decline with intact consciousness until late.' },
      { front: 'What are the features and treatment of Alzheimer disease?', back: 'Most common dementia: insidious memory loss (recent events first), then visuospatial and executive decline, later aphasia/apraxia. Treatment: cholinesterase inhibitors (donepezil) and memantine for moderate-severe disease; no cure.' },
      { front: 'What is Wernicke encephalopathy and its treatment?', back: 'Triad: Confusion, Ataxia, Ophthalmoplegia (nystagmus) — from thiamine (B1) deficiency in alcoholism. EMERGENCY: give IV thiamine BEFORE glucose to prevent Wernicke-Korsakoff syndrome. Korsakoff: irreversible amnesia with confabulation.' },
      { front: 'What is normal pressure hydrocephalus?', back: 'Triad: Urinary incontinence, Dementia, Gait apraxia (magnetic gait) — "wet, wacky, wobbly". CT: ventriculomegaly with normal CSF pressure. May improve dramatically after a ventriculoperitoneal shunt.' },
    ],
  },
  {
    id: 'pharmacology',
    name: 'Pharmacology',
    icon: '💊',
    cards: [
      { front: 'What are the main Beta Blocker classes and uses?', back: 'Cardioselective (Metoprolol, Atenolol) - prefer beta-1. Non-selective (Propranolol) - beta-1 + beta-2. With ISA (Pindolol). Uses: HTN, angina, HF, arrhythmias, migraine prevention.' },
      { front: 'Name the 5 main antibiotic classes', back: '1. Beta-lactams (penicillins, cephalosporins) 2. Macrolides (azithromycin) 3. Fluoroquinolones (ciprofloxacin) 4. Tetracyclines (doxycycline) 5. Aminoglycosides (gentamicin)' },
      { front: 'What are the main anticoagulant classes?', back: '1. Heparin (UFH) / LMWH (Enoxaparin) - indirect Xa/IIa inhibitors 2. Warfarin - Vit K antagonist 3. DOACs: Rivaroxaban, Apixaban (Xa) | Dabigatran (IIa) 4. Fondaparinux (Xa only)' },
      { front: 'How do NSAIDs work and what are the risks?', back: 'Mechanism: COX-1/COX-2 inhibitors → decreased prostaglandin synthesis. Risks: GI bleeding (COX-1 protection lost), renal impairment, cardiovascular risk, platelet dysfunction, bronchospasm in aspirin-sensitive asthmatics.' },
      { front: 'What are ACE Inhibitors and their key features?', back: 'Mechanism: Block ACE → decreased angiotensin II → vasodilation + decreased aldosterone. Side effects: Dry cough, hyperkalemia, angioedema, teratogenic. Examples: Lisinopril, Enalapril, Ramipril.' },
      { front: 'What are the adverse effects and contraindications of beta-blockers?', back: 'Effects: bradycardia, AV block, bronchospasm, fatigue, masking of hypoglycemia, depression, erectile dysfunction, cold extremities. Contraindications: severe asthma, decompensated HF, sinus bradycardia, second/third-degree AV block.' },
      { front: 'What are the two classes of calcium channel blockers?', back: 'Dihydropyridines (amlodipine, nifedipine): vascular — treat HTN/angina; cause peripheral edema. Non-dihydropyridines (verapamil, diltiazem): cardiac — rate control in AF, angina; AVOID in HF (negative inotrope) and WPW.' },
      { front: 'What are the diuretic classes and their sites of action?', back: 'Loop (furosemide): thick ascending loop of Henle — most potent; pulmonary edema, HF, renal failure. Thiazide (HCTZ): distal convoluted tubule — HTN. K-sparing (spironolactone): collecting duct — HF, cirrhosis, HTN.' },
      { front: 'What are the side effects of loop diuretics?', back: 'Hypokalemia, hyponatremia, hypomagnesemia, hypocalcemia, metabolic alkalosis, ototoxicity (high dose), dehydration/azotemia, hyperuricemia (gout), hyperglycemia.' },
      { front: 'What are the side effects of thiazide diuretics?', back: 'Hypokalemia, hyponatremia, HYPERcalcemia, hyperuricemia, hyperglycemia, hyperlipidemia, photosensitivity, and sulfa cross-reactivity. Distinctive feature versus loop: raises calcium.' },
      { front: 'What are the uses and side effects of spironolactone?', back: 'K-sparing aldosterone antagonist. Uses: HFrEF, resistant HTN, cirrhosis ascites, primary hyperaldosteronism. Side effects: hyperkalemia, gynecomastia, menstrual irregularities (antiandrogen). Caution with ACEi/ARB (K+ retention).' },
      { front: 'How do ARBs compare to ACE inhibitors?', back: 'ARBs block the AT1 receptor; ACEi block Ang I→II conversion. ARBs cause less cough and angioedema but share hyperkalemia, hypotension, and teratogenicity. Used when ACEi cough is intolerable.' },
      { front: 'What are the mechanism and side effects of statins?', back: 'HMG-CoA reductase inhibitors: ↓ cholesterol synthesis, ↑ LDL receptors. Side effects: myopathy/rhabdomyolysis, transaminitis, small increase in diabetes risk, GI upset. Myopathy risk increases with fibrates and certain interacting drugs.' },
      { front: 'What is the mechanism of clopidogrel and its key interaction?', back: 'P2Y12 inhibitor — blocks the ADP receptor on platelets. It is a prodrug activated by CYP2C19. Omeprazole (CYP2C19 inhibitor) reduces its efficacy; used in ACS, stents, and stroke prevention.' },
      { front: 'What is the mechanism and use of aspirin?', back: 'Irreversible COX-1/COX-2 inhibition → decreased thromboxane A2 → antiplatelet effect. Used in ACS, stroke prevention, and after PCI. Side effects: GI bleeding and bronchospasm (aspirin-exacerbated respiratory disease).' },
      { front: 'How is warfarin monitored and reversed?', back: 'Monitor INR (target 2-3 for most indications; 2.5-3.5 for mechanical mitral valve). Reversal: vitamin K for mild, and FFP or 4-factor PCC for life-threatening bleeding. Many drug and dietary (vitamin K) interactions.' },
      { front: 'How is heparin monitored and what is HIT?', back: 'Monitor aPTT for unfractionated heparin (LMWH needs no routine monitoring). HIT: thrombocytopenia with thrombosis 5-10 days after exposure, anti-PF4 antibodies. Treatment: STOP heparin, use a non-heparin anticoagulant (argatroban, fondaparinux).' },
      { front: 'Which DOACs are factor Xa inhibitors and which is a thrombin inhibitor?', back: 'Xa inhibitors: rivaroxaban, apixaban, edoxaban. Direct thrombin (IIa) inhibitor: dabigatran. Reversal: andexanet alfa (Xa inhibitors); idarucizumab (dabigatran).' },
      { front: 'What is the mechanism of metformin and its contraindications?', back: 'Decreases hepatic gluconeogenesis and improves insulin sensitivity (AMPK activation). Contraindications: eGFR <30, severe hypoxia/sepsis, alcoholism, acute decompensated HF, and iodinated contrast with acute kidney injury risk.' },
      { front: 'What are the side effects of metformin?', back: 'GI upset (nausea, diarrhea), B12 deficiency with long-term use, metallic taste, and rare lactic acidosis (renal failure or contrast). Does not cause hypoglycemia when used alone and is weight neutral.' },
      { front: 'What are the types of insulin and their onset?', back: 'Rapid (lispro, aspart): onset ~15 min, peak ~1 h. Short (regular): onset ~30 min, peak 2-3 h. Intermediate (NPH): onset 2-4 h, peak 4-12 h. Long (glargine, detemir): peakless, ~24 h.' },
      { front: 'What are the mechanism and side effects of sulfonylureas?', back: 'Stimulate insulin secretion by closing the K-ATP channel in pancreatic beta cells. Side effects: hypoglycemia (especially glibenclamide, elderly, renal failure) and weight gain. Examples: glipizide, glimepiride, gliclazide.' },
      { front: 'What are the mechanism and side effects of SGLT2 inhibitors?', back: 'Block renal glucose reabsorption, causing glycosuria. Benefits: heart failure, CKD, weight loss. Side effects: UTIs and genital mycosis, euglycemic DKA, volume depletion. Examples: empagliflozin, dapagliflozin.' },
      { front: 'What are the mechanism and side effects of GLP-1 receptor agonists?', back: 'Incretin mimetics: ↑ insulin, ↓ glucagon, slow gastric emptying, weight loss, CV benefit. Side effects: nausea/vomiting, rare pancreatitis, gallbladder disease; caution in MEN2 (medullary thyroid cancer risk).' },
      { front: 'How is hypothyroidism treated and monitored?', back: 'Levothyroxine (T4) once daily on an empty stomach. Recheck TSH 6-8 weeks after a dose change; goal is a normal TSH. Myxedema coma: IV levothyroxine, hydrocortisone, and supportive care.' },
      { front: 'What are the mechanism and side effects of thionamides (PTU, methimazole)?', back: 'Inhibit thyroid peroxidase, decreasing thyroid hormone synthesis. Side effects: agranulocytosis (fever/sore throat → check CBC), hepatotoxicity (PTU), rash. PTU is preferred in the first trimester of pregnancy.' },
      { front: 'What are the adverse effects of long-term corticosteroids?', back: 'Cushingoid features, hyperglycemia, osteoporosis, immunosuppression, GI ulcers, adrenal suppression, cataracts, glaucoma, proximal myopathy, weight gain. Always taper to avoid adrenal crisis.' },
      { front: 'What is opioid toxicity and its treatment?', back: 'Features: pinpoint pupils, respiratory depression (↓ RR), coma, hypotension. Treatment: naloxone titrated to restore breathing (watch for re-sedation with long-acting opioids) plus airway support.' },
      { front: 'What is paracetamol (acetaminophen) toxicity and its antidote?', back: 'Initially asymptomatic, then nausea and RUQ pain, with hepatic failure at 48-72 h. Antidote: N-acetylcysteine. Consider if dose >150 mg/kg or a toxic level on the Rumack-Matthew nomogram.' },
      { front: 'What are the uses and side effects of nitroglycerin?', back: 'Venodilator (and arterial) → decreased preload and myocardial O2 demand. Uses: angina, ACS, hypertensive emergency, CHF. Side effects: headache, flushing, hypotension, reflex tachycardia. Contraindications: PDE5 inhibitors (sildenafil), severe aortic stenosis, RV infarction.' },
      { front: 'What are the side effects of amiodarone?', back: 'Pulmonary fibrosis (most feared), thyroid dysfunction (hypo or hyper), corneal microdeposits, blue-gray skin, photosensitivity, hepatotoxicity, bradycardia, QT prolongation, neuropathy. Very long half-life (~50 days).' },
      { front: 'What are the mechanism and side effects of vancomycin?', back: 'Inhibits cell wall synthesis by binding D-ala-D-ala. Side effects: Red man syndrome (histamine release on infusion), nephrotoxicity, ototoxicity, thrombocytopenia. Monitor troughs (15-20 mcg/mL for serious infections).' },
      { front: 'What are the side effects of aminoglycosides?', back: 'Nephrotoxicity, ototoxicity (vestibular and cochlear), neuromuscular blockade, teratogenic. Concentration-dependent killing — once-daily dosing. Monitor peaks/troughs; avoid other nephrotoxins.' },
    ],
  },
  
];

// =============================================================================
// Flashcard Storage Helpers
// =============================================================================

const FLASHCARD_STORAGE_KEY = 'morven-medical-flashcards';
const NOTE_STORAGE_KEY = 'morven-medical-notes';

function loadCustomFlashcards(): Flashcard[] {
  try {
    const saved = localStorage.getItem(FLASHCARD_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveCustomFlashcards(cards: Flashcard[]) {
  try {
    localStorage.setItem(FLASHCARD_STORAGE_KEY, JSON.stringify(cards));
  } catch { /* noop */ }
}

function loadMedicalNotes(): MedicalNote[] {
  try {
    const saved = localStorage.getItem(NOTE_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveMedicalNotes(notes: MedicalNote[]) {
  try {
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(notes));
  } catch { /* noop */ }
}

// =============================================================================
// Animations
// =============================================================================

const fadeIn = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 }, transition: { duration: 0.3 } };
const staggerContainer = { animate: { transition: { staggerChildren: 0.05 } } };
const staggerItem = { initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0 } };

// =============================================================================
// Main Export
// =============================================================================

interface MedicalToolPageProps {
  toolId: string;
}


export function MedicalToolPage({ toolId }: MedicalToolPageProps) {
  const navigate = useNavigate();
  const tool = getToolById(toolId);

  let content: JSX.Element;

  switch (toolId) {
    case 'medical-summarizer':
      content = <MedicalSummarizer />;
      break;

    case 'medical-flashcards':
      content = <MedicalFlashcards />;
      break;

    case 'medical-mcq':
      content = <MedicalMCQ />;
      break;

    case 'disease-explain':
      content = <DiseaseExplain />;
      break;

    case 'disease-compare':
      content = <DiseaseCompare />;
      break;

    case 'drug-summary':
      content = <DrugSummary />;
      break;

    case 'lab-values':
      content = <LabValuesTool />;
      break;

    case 'medical-notes':
      content = <MedicalNotesTool />;
      break;

    default:
      return (
        <EmptyState
          icon={<span className="text-4xl">⚕️</span>}
          title="الأداة غير موجودة"
          description="هذه الأداة الطبية غير متاحة حالياً."
        />
      );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={() => navigate('/category/medical')}
          className="flex items-center gap-2 text-gray-500 hover:text-primary-500 dark:text-gray-400 dark:hover:text-primary-400 transition-colors mb-6 group"
        >
          <svg
            className="w-5 h-5 transition-transform rotate-180 group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>

          <span className="text-sm font-medium">
            {'العودة للأدوات الطبية'}
          </span>
        </button>
      </motion.div>

      {tool && (
        <ToolHero
          icon={<tool.icon className="w-7 h-7" />}
          title={tool.name}
          description={tool.description}
        />
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card>
          {content}
        </Card>
      </motion.div>
    </div>
  );
}


// =============================================================================
// 1. Medical Summarizer
// =============================================================================

function MedicalSummarizer() {
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState('');
  const [keyIdeas, setKeyIdeas] = useState<string[]>([]);
  const [terminology, setTerminology] = useState<{ term: string; definition: string }[]>([]);
  const [simplified, setSimplified] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const { addNotification } = useAppStore();

  const handleProcess = useCallback(() => {
    if (!input.trim()) {
      addNotification('Please enter some medical text to process.', 'warning');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      try {
        const s = summarizeText(input);
        const k = extractKeyIdeas(input);
        const term = extractTerminology(input);
        const simp = explainSimply(input);
        setSummary(s);
        setKeyIdeas(k);
        setTerminology(term);
        setSimplified(simp);
        addNotification('Text processed successfully!', 'success');
      } catch {
        addNotification('Error processing text.', 'error');
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [input, addNotification]);

  const tabs = [
    { id: 'summary', label: 'الملخص' },
    { id: 'key-ideas', label: 'الأفكار الرئيسية' },
    { id: 'terminology', label: 'المصطلحات' },
    { id: 'simplified', label: 'مبسط' },
  ];

  const hasResult = summary || keyIdeas.length > 0;

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-2 dark:text-white">{'تلخيص النصوص الطبية'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{'الصق النص الطبي لتوليد ملخص وأفكار رئيسية ومصطلحات وشرح مبسط.'}</p>
        <TextArea
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          placeholder={'الصق النص الطبي هنا...'}
          rows={10}
          className="mb-4"
        />
        <Button onClick={handleProcess} disabled={loading || !input.trim()} className="w-full sm:w-auto">
          {loading ? 'جاري المعالجة...' : 'معالجة النص'}
        </Button>
      </Card>

      {loading && (
        <Card className="p-6">
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 dark:text-gray-400">{'جاري تحليل النص الطبي...'}</span>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {hasResult && !loading && (
          <motion.div {...fadeIn}>
            <Card className="p-6">
              <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

              <div className="mt-4">
                {activeTab === 'summary' && summary && (
                  <motion.div {...fadeIn}>
                    <h3 className="text-lg font-semibold mb-2 dark:text-white">{'الملخص'}</h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{summary}</p>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'key-ideas' && keyIdeas.length > 0 && (
                  <motion.div {...fadeIn}>
                    <h3 className="text-lg font-semibold mb-2 dark:text-white">{'الأفكار الرئيسية'}</h3>
                    <div className="space-y-2">
                      {keyIdeas.map((idea, i) => (
                        <div key={i} className="flex items-start gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                          <Badge variant="success" className="mt-0.5 shrink-0">{i + 1}</Badge>
                          <span className="text-gray-700 dark:text-gray-300">{idea}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'terminology' && terminology.length > 0 && (
                  <motion.div {...fadeIn}>
                    <h3 className="text-lg font-semibold mb-2 dark:text-white">{'المصطلحات الطبية'}</h3>
                    <div className="space-y-2">
                      {terminology.map((item, i) => (
                        <div key={i} className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                          <span className="font-semibold text-purple-700 dark:text-purple-300">{item.term}</span>
                          <span className="text-gray-500 dark:text-gray-400 mx-2">—</span>
                          <span className="text-gray-700 dark:text-gray-300">{item.definition}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'simplified' && simplified && (
                  <motion.div {...fadeIn}>
                    <h3 className="text-lg font-semibold mb-2 dark:text-white">{'شرح مبسط'}</h3>
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{simplified}</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// 2. Medical Flashcards
// =============================================================================

type FlashcardMode = 'decks' | 'study' | 'create';

const DECK_ICONS: Record<string, LucideIcon> = {
  cardiovascular: HeartPulse,
  respiratory: Wind,
  neuro: Brain,
  pharmacology: Pill,
  general: Stethoscope,
  custom: Notebook,
};

interface DeckTheme {
  gradient: string;
  border: string;
  iconWrap: string;
  icon: string;
  studyBtn: string;
  count: string;
  glow: string;
}

const DECK_THEMES: Record<string, DeckTheme> = {
  cardiovascular: {
    gradient: 'from-rose-50 via-white to-white dark:from-rose-500/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-rose-100 dark:border-rose-900/30',
    iconWrap: 'bg-rose-100 dark:bg-rose-500/15',
    icon: 'text-rose-500 dark:text-rose-300',
    studyBtn: 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-500/30',
    count: 'text-rose-500 dark:text-rose-300',
    glow: 'bg-rose-400/10',
  },
  respiratory: {
    gradient: 'from-sky-50 via-white to-white dark:from-sky-500/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-sky-100 dark:border-sky-900/30',
    iconWrap: 'bg-sky-100 dark:bg-sky-500/15',
    icon: 'text-sky-500 dark:text-sky-300',
    studyBtn: 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm shadow-sky-500/30',
    count: 'text-sky-500 dark:text-sky-300',
    glow: 'bg-sky-400/10',
  },
  neuro: {
    gradient: 'from-violet-50 via-white to-white dark:from-violet-500/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-violet-100 dark:border-violet-900/30',
    iconWrap: 'bg-violet-100 dark:bg-violet-500/15',
    icon: 'text-violet-500 dark:text-violet-300',
    studyBtn: 'bg-violet-500 text-white hover:bg-violet-600 shadow-sm shadow-violet-500/30',
    count: 'text-violet-500 dark:text-violet-300',
    glow: 'bg-violet-400/10',
  },
  pharmacology: {
    gradient: 'from-emerald-50 via-white to-white dark:from-emerald-500/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-emerald-100 dark:border-emerald-900/30',
    iconWrap: 'bg-emerald-100 dark:bg-emerald-500/15',
    icon: 'text-emerald-500 dark:text-emerald-300',
    studyBtn: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/30',
    count: 'text-emerald-500 dark:text-emerald-300',
    glow: 'bg-emerald-400/10',
  },
  general: {
    gradient: 'from-amber-50 via-white to-white dark:from-amber-500/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-amber-100 dark:border-amber-900/30',
    iconWrap: 'bg-amber-100 dark:bg-amber-500/15',
    icon: 'text-amber-500 dark:text-amber-300',
    studyBtn: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/30',
    count: 'text-amber-500 dark:text-amber-300',
    glow: 'bg-amber-400/10',
  },
  custom: {
    gradient: 'from-indigo-50 via-white to-white dark:from-indigo-500/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-indigo-100 dark:border-indigo-900/30',
    iconWrap: 'bg-indigo-100 dark:bg-indigo-500/15',
    icon: 'text-indigo-500 dark:text-indigo-300',
    studyBtn: 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm shadow-indigo-500/30',
    count: 'text-indigo-500 dark:text-indigo-300',
    glow: 'bg-indigo-400/10',
  },
};

const DEFAULT_DECK_THEME = DECK_THEMES.custom;

function MedicalFlashcards() {
  const [mode, setMode] = useState<FlashcardMode>('decks');
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [studyIndex, setStudyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyCards, setStudyCards] = useState<{ front: string; back: string }[]>([]);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newDeck, setNewDeck] = useState('Custom');
  const [customCards, setCustomCards] = useState<Flashcard[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [masteredCount, setMasteredCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [deckSearch, setDeckSearch] = useState('');
  const incrementCardsReviewed = useStatsStore((s) => s.incrementCardsReviewed);
  const { addNotification, flashcards, addFlashcard, deleteFlashcard } = useAppStore();

  useEffect(() => {
    setCustomCards(loadCustomFlashcards());
  }, []);

  useEffect(() => {
    saveCustomFlashcards(customCards);
  }, [customCards]);

  const allDecks = useMemo(() => {
    const customDeck: FlashcardDeck = {
      id: 'custom',
      name: 'Custom',
      icon: <Notebook className="w-8 h-8 text-blue-500" />,
      cards: customCards.map((c) => ({ front: c.front, back: c.back })),
    };
    return [...BUILT_IN_DECKS, customDeck];
  }, [customCards]);

  const filteredDecks = useMemo(() => {
    const q = deckSearch.trim().toLowerCase();
    if (!q) return allDecks;
    return allDecks.filter((d) => d.name.toLowerCase().includes(q));
  }, [allDecks, deckSearch]);

  const totalCards = useMemo(() => allDecks.reduce((sum, d) => sum + d.cards.length, 0), [allDecks]);

  const startStudy = useCallback((deckId: string) => {
    const deck = allDecks.find((d) => d.id === deckId);
    if (!deck || deck.cards.length === 0) {
      addNotification('This deck has no cards.', 'warning');
      return;
    }
    setSelectedDeck(deckId);
    setStudyCards(deck.cards);
    setStudyIndex(0);
    setIsFlipped(false);
    setShowAnswer(false);
    setMasteredCount(0);
    setReviewCount(0);
    setMode('study');
  }, [allDecks, addNotification]);

  const prevCard = useCallback(() => {
    setIsFlipped(false);
    setShowAnswer(false);
    if (studyIndex > 0) {
      setStudyIndex((p) => p - 1);
    }
  }, [studyIndex]);

  const nextCard = useCallback(() => {
    setIsFlipped(false);
    setShowAnswer(false);
    if (studyIndex < studyCards.length - 1) {
      setStudyIndex((p) => p + 1);
    } else {
      addNotification(`Study session complete! Mastered ${masteredCount} of ${studyCards.length} cards.`, 'success');
      setMode('decks');
    }
  }, [studyIndex, studyCards.length, masteredCount, addNotification]);

  const handleMastered = useCallback(() => {
    setMasteredCount((p) => p + 1);
    incrementCardsReviewed();
    nextCard();
  }, [nextCard, incrementCardsReviewed]);

  const handleReviewLater = useCallback(() => {
    setReviewCount((p) => p + 1);
    incrementCardsReviewed();
    nextCard();
  }, [nextCard, incrementCardsReviewed]);

  const handleAddCard = useCallback(() => {
    if (!newFront.trim() || !newBack.trim()) {
      addNotification('Please fill in both front and back.', 'warning');
      return;
    }
    addFlashcard(newFront.trim(), newBack.trim(), newDeck);
    setCustomCards((prev) => [
      ...prev,
      {
        id: `card-${Date.now()}`,
        front: newFront.trim(),
        back: newBack.trim(),
        deck: newDeck,
        difficulty: 'medium',
        nextReview: Date.now(),
        reviewCount: 0,
        createdAt: Date.now(),
      },
    ]);
    setNewFront('');
    setNewBack('');
    addNotification('Flashcard created!', 'success');
  }, [newFront, newBack, newDeck, addFlashcard, addNotification]);

  const handleDeleteCard = useCallback((id: string) => {
    deleteFlashcard(id);
    setCustomCards((prev) => prev.filter((c) => c.id !== id));
    addNotification('Flashcard deleted.', 'info');
  }, [deleteFlashcard, addNotification]);

  if (mode === 'study' && studyCards.length > 0) {
    const card = studyCards[studyIndex];
    const deckName = allDecks.find((d) => d.id === selectedDeck)?.name ?? '';

    return (
      <motion.div {...fadeIn} dir="rtl" className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setMode('decks')}
            className="flex items-center gap-2 rounded-full border border-light-border dark:border-dark-border bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:text-primary-600 dark:bg-dark-card dark:text-gray-300 dark:hover:bg-dark-hover dark:hover:text-primary-300"
          >
            <ArrowLeft className={`h-4 w-4 transition-transform ${'rotate-180'}`} />
            <span className="hidden sm:inline">{'رجوع'}</span>
          </button>

          <div className="flex flex-col items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white sm:text-base">{deckName}</h2>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">
              {studyIndex + 1} / {studyCards.length}
            </p>
          </div>

          <div className="w-24" aria-hidden="true" />
        </div>

        <ProgressBar
          value={((studyIndex + 1) / studyCards.length) * 100}
          color="gradient"
          className="mt-5"
        />

        {/* Flashcard */}
        <div className="flex flex-1 items-center justify-center py-8 sm:py-10" style={{ perspective: '1600px' }}>
          <motion.div
            className="relative w-full max-w-2xl cursor-pointer select-none"
            style={{ transformStyle: 'preserve-3d' }}
            onClick={() => setIsFlipped((f) => !f)}
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.45, 0.05, 0.35, 1] }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            {/* Front face */}
            <div
              className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-3xl border border-white/50 bg-white/85 p-8 shadow-elevated backdrop-blur-xl dark:border-white/10 dark:bg-dark-card/85 sm:min-h-[360px] sm:p-12"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            >
              <span className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
                <BookOpen className="h-3.5 w-3.5" />
                {'السؤال'}
              </span>
              <p className="text-center text-2xl font-semibold leading-snug text-gray-900 dark:text-white sm:text-[28px]">
                {card.front}
              </p>
            </div>

            {/* Back face */}
            <div
              className="absolute inset-0 flex min-h-[300px] w-full flex-col items-center justify-center rounded-3xl border border-white/50 bg-gradient-to-br from-emerald-50 via-white to-white p-8 shadow-elevated backdrop-blur-xl dark:border-emerald-900/30 dark:from-emerald-500/15 dark:via-dark-card dark:to-dark-card sm:min-h-[360px] sm:p-12"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <span className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {'الإجابة'}
              </span>
              <p className="max-h-[240px] overflow-y-auto text-center text-lg font-medium leading-relaxed text-gray-800 dark:text-gray-200 sm:text-xl">
                {card.back}
              </p>
            </div>
          </motion.div>
        </div>

        {/* Confidence rating */}
        <div className="flex min-h-[56px] items-center justify-center">
          {isFlipped ? (
            <motion.div {...fadeIn} className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="secondary" onClick={handleReviewLater} className="px-6">
                {'مراجعة مرة أخرى'}
              </Button>
              <Button variant="success" onClick={handleMastered} className="px-6">
                {'أتقنتها!'}
              </Button>
            </motion.div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {'انقر على البطاقة لعرض الإجابة'}
            </p>
          )}
        </div>

        {/* Bottom navigation */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <button
            onClick={prevCard}
            disabled={studyIndex === 0}
            className="flex h-12 items-center gap-2 rounded-full border border-light-border dark:border-dark-border bg-white px-4 text-sm font-medium text-gray-700 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:text-primary-600 dark:bg-dark-card dark:text-gray-300 dark:hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
          >
            <ChevronLeft className={`h-5 w-5 ${'rotate-180'}`} />
            <span className="hidden sm:inline">{'السابق'}</span>
          </button>

          <motion.button
            onClick={() => setIsFlipped((f) => !f)}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex h-12 items-center gap-2 rounded-full bg-primary-600 px-6 text-sm font-semibold text-white shadow-md shadow-primary-600/30 transition-colors hover:bg-primary-700"
          >
            <RefreshCw className={`h-5 w-5 transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} />
            {'اقلب'}
          </motion.button>

          <button
            onClick={nextCard}
            className="flex h-12 items-center gap-2 rounded-full border border-light-border dark:border-dark-border bg-white px-4 text-sm font-medium text-gray-700 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:text-primary-600 dark:bg-dark-card dark:text-gray-300 dark:hover:text-primary-300 sm:px-5"
          >
            <span className="hidden sm:inline">{'التالي'}</span>
            <ChevronRight className={`h-5 w-5 ${'rotate-180'}`} />
          </button>
        </div>

        {/* Session stats */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Chip variant="success" label={`${'أتقنتها'}: ${masteredCount}`} />
          <Chip variant="warning" label={`${'مراجعة'}: ${reviewCount}`} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} dir="rtl" className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-light-border dark:border-dark-border bg-gradient-to-br from-primary-50 via-white to-white px-6 py-10 shadow-card dark:from-primary-900/20 dark:via-dark-card dark:to-dark-card sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-56 w-56 rounded-full bg-rose-400/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-600 shadow-sm dark:bg-primary-500/15 dark:text-primary-300">
              <Layers className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                {'البطاقات التعليمية الطبية'}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-gray-500 dark:text-gray-400 sm:text-base">
                {'أتقن المفاهيم الطبية عبر بطاقات تعليمية تفاعلية في المواضيع الرئيسية.'}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchBar
              value={deckSearch}
              onChange={setDeckSearch}
              placeholder={'ابحث في المجموعات...'}
              shortcut=""
              className="w-full sm:max-w-sm"
            />
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{filteredDecks.length}</span>
              <span className="text-gray-500 dark:text-gray-400">{'المجموعات'}</span>
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{totalCards}</span>
              <span className="text-gray-500 dark:text-gray-400">{'بطاقة'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Segmented control */}
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 rounded-full border border-light-border dark:border-dark-border bg-gray-50 p-1 dark:bg-dark-surface">
          {(['decks', 'create'] as FlashcardMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 ${
                mode === m
                  ? 'bg-white text-primary-600 shadow-sm dark:bg-dark-card dark:text-primary-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {m === 'decks' ? 'المجموعات' : 'إنشاء بطاقة'}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'create' && (
          <motion.div key="create" {...fadeIn} className="space-y-6">
            <Card className="p-6 sm:p-8">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{'إنشاء بطاقة تعليمية جديدة'}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {'أضف بطاقاتك الخاصة إلى المجموعة المخصصة لدراسة مخصصة تناسبك.'}
              </p>
              <div className="mt-5 space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{'الوجه (السؤال)'}</label>
                  <TextArea
                    value={newFront}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewFront(e.target.value)}
                    placeholder={'أدخل السؤال أو التلميح...'}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{'الظهر (الإجابة)'}</label>
                  <TextArea
                    value={newBack}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewBack(e.target.value)}
                    placeholder={'أدخل الإجابة أو الشرح...'}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{'المجموعة'}</label>
                  <Input
                    value={newDeck}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDeck(e.target.value)}
                    placeholder="Custom"
                  />
                </div>
                <Button onClick={handleAddCard} className="w-full sm:w-auto">{'إضافة بطاقة'}</Button>
              </div>
            </Card>

            {customCards.length > 0 && (
              <Card className="p-6 sm:p-8">
                <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">{`بطاقاتك المخصصة (${customCards.length})`}</h3>
                <div className="space-y-2">
                  {customCards.map((card) => (
                    <div key={card.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3 transition-colors hover:bg-gray-100 dark:bg-dark-surface dark:hover:bg-dark-hover">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-gray-900 dark:text-white">{card.front}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{card.back}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCard(card.id)} className="ms-2 text-red-500">
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {mode === 'decks' && (
          <motion.div key="decks" {...fadeIn}>
            {filteredDecks.length === 0 ? (
              <EmptyState
                icon={<Search className="h-8 w-8" />}
                title={'لا توجد مجموعات'}
                description={'جرب مصطلح بحث مختلف.'}
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDecks.map((deck) => {
                  const theme = DECK_THEMES[deck.id] ?? DEFAULT_DECK_THEME;
                  const DeckIcon = DECK_ICONS[deck.id] ?? Notebook;
                  return (
                    <motion.div key={deck.id} variants={staggerItem}>
                      <div
                        onClick={() => startStudy(deck.id)}
                        className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border bg-gradient-to-br p-6 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-elevated ${theme.gradient} ${theme.border}`}
                      >
                        <div className={`pointer-events-none absolute -end-6 -top-8 h-28 w-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150 ${theme.glow}`} />

                        <div className="relative flex items-start justify-between gap-3">
                          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-110 ${theme.iconWrap}`}>
                            <DeckIcon className={`h-6 w-6 ${theme.icon}`} />
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); startStudy(deck.id); }}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105 ${theme.studyBtn}`}
                          >
                            {'دراسة'}
                            <ArrowRight className={`h-3.5 w-3.5 ${'rotate-180'}`} />
                          </button>
                        </div>

                        <div className="relative mt-6">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{deck.name}</h3>
                          <p className={`mt-1 text-sm font-medium tabular-nums ${theme.count}`}>
                            {deck.cards.length} {'بطاقة'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// 3. Medical MCQ
// =============================================================================

function MedicalMCQ() {
  const [input, setInput] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const { addNotification } = useAppStore();
  const incrementQuizzesCompleted = useStatsStore((s) => s.incrementQuizzesCompleted);

  const handleGenerate = useCallback(() => {
    if (!input.trim()) {
      addNotification('Please enter some text to generate questions.', 'warning');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      try {
        const mcqs = generateMCQs(input, 5);
        if (mcqs.length === 0) {
          addNotification('Could not generate questions. Try different text.', 'warning');
          setLoading(false);
          return;
        }
        setQuestions(mcqs);
        setCurrentQ(0);
        setSelected(null);
        setAnswers(new Array(mcqs.length).fill(null));
        setQuizStarted(true);
        setShowResult(false);
        addNotification(`Generated ${mcqs.length} questions!`, 'success');
      } catch {
        addNotification('Error generating questions.', 'error');
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [input, addNotification]);

  const handleSelect = useCallback((optionIndex: number) => {
    if (selected !== null) return;
    setSelected(optionIndex);
    setAnswers((prev) => {
      const next = [...prev];
      next[currentQ] = optionIndex;
      return next;
    });
  }, [selected, currentQ]);

  const handleNext = useCallback(() => {
    if (currentQ < questions.length - 1) {
      setCurrentQ((p) => p + 1);
      setSelected(answers[currentQ + 1] ?? null);
    } else {
      setShowResult(true);
      incrementQuizzesCompleted();
    }
  }, [currentQ, questions.length, answers, incrementQuizzesCompleted]);

  const handlePrev = useCallback(() => {
    if (currentQ > 0) {
      setCurrentQ((p) => p - 1);
      setSelected(answers[currentQ - 1] ?? null);
    }
  }, [currentQ, answers]);

  const score = useMemo(() => {
    return questions.reduce((acc, q, i) => (answers[i] === q.correct ? acc + 1 : acc), 0);
  }, [questions, answers]);

  const reset = useCallback(() => {
    setQuizStarted(false);
    setQuestions([]);
    setCurrentQ(0);
    setSelected(null);
    setAnswers([]);
    setShowResult(false);
  }, []);

  const restartQuiz = useCallback(() => {
    setCurrentQ(0);
    setSelected(null);
    setAnswers(new Array(questions.length).fill(null));
    setShowResult(false);
  }, [questions.length]);

  const detectedCategories = useMemo(() => {
    const found = new Set<string>();
    const lower = input.toLowerCase();
    for (const key of Object.keys(DISEASES)) {
      const d = DISEASES[key];
      if (lower.includes(key.toLowerCase()) || lower.includes(d.name.toLowerCase())) {
        found.add(d.category);
      }
    }
    return Array.from(found).sort();
  }, [input]);

  const getPerformanceMessage = useCallback((pct: number) => {
    if (pct >= 90) return 'ممتاز!';
    if (pct >= 70) return 'عمل رائع!';
    if (pct >= 50) return 'مجهود جيد!';
    return 'واصل التدريب!';
  }, []);

  if (quizStarted && questions.length > 0 && showResult) {
    const pct = Math.round((score / questions.length) * 100);
    const correctCount = score;
    const wrongCount = questions.length - score;
    const good = pct >= 70;
    return (
      <motion.div {...fadeIn} dir="rtl" className="mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-3xl border border-light-border dark:border-dark-border bg-gradient-to-br from-emerald-50 via-white to-white px-6 py-10 text-center shadow-card dark:from-emerald-900/20 dark:via-dark-card dark:to-dark-card sm:px-10">
          <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -start-16 h-48 w-48 rounded-full bg-primary-500/10 blur-3xl" />

          <div className="relative">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <span className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${good ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'}`}>
                {good ? <Award className="h-8 w-8 text-emerald-500 dark:text-emerald-300" /> : <Target className="h-8 w-8 text-amber-500 dark:text-amber-300" />}
              </span>
            </motion.div>

            <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              {'اكتمل الاختبار!'}
            </h2>
            <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-300">{getPerformanceMessage(pct)}</p>

            <div className="mt-6 flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="text-5xl font-extrabold tabular-nums">
                  <span className={good ? 'text-emerald-500 dark:text-emerald-300' : 'text-amber-500 dark:text-amber-300'}>{score}</span>
                  <span className="text-2xl text-gray-400 dark:text-gray-500"> / {questions.length}</span>
                </div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{'النتيجة'}</p>
              </div>
              <div className="h-16 w-px bg-gray-200 dark:bg-dark-border" aria-hidden="true" />
              <div className="text-center">
                <div className="text-5xl font-extrabold tabular-nums text-gray-900 dark:text-white">{pct}%</div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{'الدقة'}</p>
              </div>
            </div>

            <ProgressBar value={pct} color={good ? 'success' : pct >= 50 ? 'warning' : 'danger'} className="mx-auto mt-6 max-w-md" />

            <div className="mt-6 flex items-center justify-center gap-3">
              <Chip variant="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={`${correctCount} ${'صحيح'}`} />
              <Chip variant="danger" icon={<XCircle className="h-3.5 w-3.5" />} label={`${wrongCount} ${'خطأ'}`} />
            </div>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button onClick={restartQuiz} className="w-full sm:w-auto">
                <RefreshCw className={`me-2 h-4 w-4 ${'rotate-180'}`} />
                {'إعادة الاختبار'}
              </Button>
              <Button variant="secondary" onClick={reset} className="w-full sm:w-auto">
                {'اختبار جديد'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <BookOpen className="h-4 w-4 text-primary-500" />
            {'راجع إجاباتك'}
          </h3>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const ok = answers[i] === q.correct;
              return (
                <motion.div
                  key={i}
                  {...fadeIn}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    ok
                      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-500/5'
                      : 'border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-500/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-100 text-red-500 dark:bg-red-500/15 dark:text-red-300'}`}>
                      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">{i + 1}. {q.question}</p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {'إجابتك'}: {q.options[answers[i] ?? 0]}
                      </p>
                      {answers[i] !== q.correct && (
                        <p className="mt-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {'صحيح'}: {q.options[q.correct]}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    );
  }

  if (quizStarted && questions.length > 0) {
    const q = questions[currentQ];
    const total = questions.length;
    const singleCategory = detectedCategories.length === 1 ? formatCategoryName(detectedCategories[0]) : null;
    const isAnswered = selected !== null;
    return (
      <motion.div {...fadeIn} dir="rtl" className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-full border border-light-border dark:border-dark-border bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:text-primary-600 dark:bg-dark-card dark:text-gray-300 dark:hover:bg-dark-hover dark:hover:text-primary-300"
          >
            <ArrowLeft className={`h-4 w-4 transition-transform ${'rotate-180'}`} />
            <span className="hidden sm:inline">{'رجوع'}</span>
          </button>

          <div className="flex flex-col items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white sm:text-base">{singleCategory ?? 'اختبار طبي'}</h2>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">
              {'السؤال'} {currentQ + 1} / {total}
            </p>
          </div>

          <div className="w-24" aria-hidden="true" />
        </div>

        <ProgressBar value={((currentQ + 1) / total) * 100} color="gradient" className="mt-5" />

        <div className="relative mt-6 overflow-hidden rounded-3xl border border-light-border dark:border-dark-border bg-white/85 p-8 shadow-card backdrop-blur-xl dark:bg-dark-card/85 sm:p-10">
          <div className="pointer-events-none absolute -end-12 -top-12 h-32 w-32 rounded-full bg-primary-500/10 blur-3xl" />
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
            <ClipboardList className="h-3.5 w-3.5" />
            {'السؤال'} {currentQ + 1}
          </span>
          <motion.h3
            key={currentQ}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mt-4 text-xl font-semibold leading-snug text-gray-900 dark:text-white sm:text-2xl"
          >
            {q.question}
          </motion.h3>
        </div>

        <div className="mt-5 space-y-3">
          {q.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            let state: 'idle' | 'correct' | 'wrong' | 'dimmed' = 'idle';
            if (selected !== null) {
              if (i === q.correct) state = 'correct';
              else if (i === selected) state = 'wrong';
              else state = 'dimmed';
            }
            const optionClasses = {
              idle: 'border-light-border dark:border-dark-border bg-white hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-elevated dark:bg-dark-card dark:hover:border-primary-500/50 dark:hover:shadow-primary-500/10',
              correct: 'border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-500/10 shadow-lg shadow-emerald-500/10',
              wrong: 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-500/10 shadow-lg shadow-red-500/10',
              dimmed: 'border-light-border dark:border-dark-border bg-white opacity-40 dark:bg-dark-card',
            }[state];
            const letterClasses = {
              idle: 'bg-gray-100 text-gray-600 group-hover:bg-primary-50 group-hover:text-primary-600 dark:bg-dark-surface dark:text-gray-400 dark:group-hover:bg-primary-500/10 dark:group-hover:text-primary-300',
              correct: 'bg-emerald-500 text-white',
              wrong: 'bg-red-500 text-white',
              dimmed: 'bg-gray-100 text-gray-600 dark:bg-dark-surface dark:text-gray-400',
            }[state];
            return (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={selected === null ? { scale: 1.01, y: -2 } : {}}
                whileTap={selected === null ? { scale: 0.98 } : {}}
                disabled={selected !== null}
                onClick={() => handleSelect(i)}
                className={`group flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-start shadow-sm transition-all duration-200 sm:p-5 ${optionClasses}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-200 ${letterClasses}`}>
                  {letter}
                </span>
                <span className={`flex-1 text-sm font-medium sm:text-base ${state === 'dimmed' ? 'text-gray-500 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                  {opt}
                </span>
                {state === 'correct' && <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500 dark:text-emerald-400" />}
                {state === 'wrong' && <XCircle className="h-6 w-6 shrink-0 text-red-500 dark:text-red-400" />}
              </motion.button>
            );
          })}
        </div>

        <div className="mt-6 flex min-h-[56px] items-center justify-between gap-3">
          <Button variant="secondary" onClick={handlePrev} disabled={currentQ === 0} className="px-5">
            <ChevronLeft className={`me-1 h-4 w-4 ${'rotate-180'}`} />
            {'السابق'}
          </Button>
          {isAnswered ? (
            <motion.div {...fadeIn}>
              <Button onClick={handleNext} className="px-6">
                {currentQ < total - 1 ? 'السؤال التالي' : 'عرض النتائج'}
                <ArrowRight className={`ms-2 h-4 w-4 ${'rotate-180'}`} />
              </Button>
            </motion.div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">{'اختر إجابة للمتابعة'}</p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} dir="rtl" className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-light-border dark:border-dark-border bg-gradient-to-br from-primary-50 via-white to-white px-6 py-10 shadow-card dark:from-primary-900/20 dark:via-dark-card dark:to-dark-card sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-600 shadow-sm dark:bg-primary-500/15 dark:text-primary-300">
              <ClipboardList className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                {'أسئلة طبية متعددة الخيارات'}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-gray-500 dark:text-gray-400 sm:text-base">
                {'ولّد أسئلة متعددة الخيارات تفاعلية من ملاحظاتك الطبية واختبر نفسك.'}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-semibold text-gray-900 shadow-sm dark:bg-dark-card dark:text-white">
              <Sparkles className="h-4 w-4 text-primary-500" />
              5
              <span className="font-normal text-gray-500 dark:text-gray-400">{'أسئلة لكل اختبار'}</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-semibold text-gray-900 shadow-sm dark:bg-dark-card dark:text-white">
              <Layers className="h-4 w-4 text-emerald-500" />
              {detectedCategories.length}
              <span className="font-normal text-gray-500 dark:text-gray-400">{'المواضيع'}</span>
            </span>
          </div>
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{'أنشئ اختبارك'}</h2>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {'الصق النص الطبي أدناه وسنقوم بتوليد اختبار من 5 أسئلة منه.'}
        </p>
        <div className="mt-5 space-y-5">
          <TextArea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            placeholder={'الصق النص الطبي هنا لتوليد أسئلة الاختبار...'}
            rows={8}
            className="text-base"
          />

          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-h-[32px] flex-1 flex-wrap items-center gap-2">
              {detectedCategories.length > 0 ? (
                detectedCategories.map((cat) => {
                  const CatIcon = getCategoryIcon(cat);
                  return <Chip key={cat} variant="primary" icon={<CatIcon className="h-3.5 w-3.5" />} label={formatCategoryName(cat)} />;
                })
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">{'ستظهر المواضيع المكتشفة هنا'}</p>
              )}
            </div>
            <Button onClick={handleGenerate} disabled={loading || !input.trim()} className="shrink-0">
              {loading ? 'جاري التوليد...' : 'توليد الاختبار'}
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// =============================================================================
// Disease category grouping helpers
// =============================================================================

const DISEASE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  cardiovascular: HeartPulse,
  respiratory: Wind,
  neurology: Brain,
  gastroenterology: UtensilsCrossed,
  nephrology: Droplets,
  endocrine: Activity,
  hematology: Droplet,
  infectious: Bug,
  rheumatology: Bone,
  dermatology: Flower2,
  ent: Ear,
  musculoskeletal: Dumbbell,
  metabolic: FlaskConical,
  psychiatry: Smile,
  oncology: Syringe,
  urology: Beaker,
  obgyn: Baby,
  emergency: Siren,
};

const DEFAULT_DISEASE_CATEGORY_ICON: LucideIcon = Stethoscope;

function formatCategoryName(category: string): string {
  return category
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCategoryIcon(category: string): LucideIcon {
  return DISEASE_CATEGORY_ICONS[category] ?? DEFAULT_DISEASE_CATEGORY_ICON;
}

interface DiseaseCategoryGroup {
  category: string;
  diseases: string[];
}

function groupDiseasesByCategory(diseaseKeys: string[]): DiseaseCategoryGroup[] {
  const groups = groupBy(diseaseKeys, (key) => DISEASES[key].category);
  return Object.entries(groups)
    .map(([category, diseases]) => ({ category, diseases }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function DiseaseCard({
  name,
  description,
  onClick,
}: {
  name: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <h3 dir="ltr" className="font-semibold dark:text-white text-left">{name}</h3>
      <p dir="ltr" className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 text-left">{description}</p>
    </Card>
  );
}

function DiseaseCategoryCard({
  category,
  diseaseCount,
  onClick,
}: {
  category: string;
  diseaseCount: number;
  onClick: () => void;
}) {
  const Icon = getCategoryIcon(category);

  return (
    <Card className="p-5 cursor-pointer hover:shadow-md transition-shadow group h-full" onClick={onClick}>
      <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform duration-200" />
      </div>
      <h3 className="font-semibold dark:text-white">{formatCategoryName(category)}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {`${diseaseCount} مرض`}
      </p>
    </Card>
  );
}

type DiseaseAccent = 'red' | 'amber' | 'emerald';

const DISEASE_ACCENT_STYLES: Record<
  DiseaseAccent,
  { card: string; border: string; iconWrap: string; icon: string; dot: string; countBadge: string; chipHover: string }
> = {
  red: {
    card: 'from-red-50/60 via-white to-white dark:from-red-900/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-red-100 dark:border-red-900/30',
    iconWrap: 'bg-red-100 dark:bg-red-900/30',
    icon: 'text-red-500 dark:text-red-400',
    dot: 'bg-red-400',
    countBadge: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    chipHover: 'hover:border-red-200 hover:bg-white dark:hover:border-red-800/50 dark:hover:bg-white/10',
  },
  amber: {
    card: 'from-amber-50/60 via-white to-white dark:from-amber-900/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-amber-100 dark:border-amber-900/30',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/30',
    icon: 'text-amber-500 dark:text-amber-400',
    dot: 'bg-amber-400',
    countBadge: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    chipHover: 'hover:border-amber-200 hover:bg-white dark:hover:border-amber-800/50 dark:hover:bg-white/10',
  },
  emerald: {
    card: 'from-emerald-50/60 via-white to-white dark:from-emerald-900/15 dark:via-dark-card dark:to-dark-card',
    border: 'border-emerald-100 dark:border-emerald-900/30',
    iconWrap: 'bg-emerald-100 dark:bg-emerald-900/30',
    icon: 'text-emerald-500 dark:text-emerald-400',
    dot: 'bg-emerald-400',
    countBadge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-200 hover:bg-white dark:hover:border-emerald-800/50 dark:hover:bg-white/10',
  },
};

function DiseaseStatPill({
  icon: Icon,
  count,
  label,
  accent,
}: {
  icon: LucideIcon;
  count: number;
  label: string;
  accent: DiseaseAccent;
}) {
  const s = DISEASE_ACCENT_STYLES[accent];
  return (
    <div className={`inline-flex items-center gap-2.5 rounded-full border bg-gradient-to-b px-4 py-2 shadow-sm ${s.border} ${s.card}`}>
      <Icon className={`h-4 w-4 ${s.icon}`} />
      <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{count}</span>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

function DiseaseCategoryBadge({ category }: { category: string }) {
  const Icon = getCategoryIcon(category);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200/70 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-primary-700 shadow-sm dark:border-primary-800/40 dark:bg-primary-900/30 dark:text-primary-300">
      <Icon className="h-3.5 w-3.5" />
      {formatCategoryName(category)}
    </span>
  );
}

function DiseaseInfoSection({
  icon: Icon,
  title,
  items,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  accent: DiseaseAccent;
}) {
  const s = DISEASE_ACCENT_STYLES[accent];
  return (
    <motion.div variants={staggerItem} className="h-full">
      <div className={`flex h-full flex-col rounded-2xl border bg-gradient-to-b p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${s.card} ${s.border}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconWrap}`}>
              <Icon className={`h-5 w-5 ${s.icon}`} />
            </span>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
          <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.countBadge}`}>{items.length}</span>
        </div>
        <ul dir="ltr" className="mt-5 space-y-2 text-left">
          {items.map((item, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * i, duration: 0.3, ease: 'easeOut' }}
              className={`flex items-start gap-2.5 rounded-xl border border-transparent bg-white/70 px-3.5 py-2.5 transition-all duration-200 dark:bg-white/5 ${s.chipHover}`}
            >
              <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.dot}`} />
              <span className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{item}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// =============================================================================
// 4. Disease Explain
// =============================================================================

function DiseaseExplain() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);

  const filteredDiseases = useMemo(() => {
    if (!search.trim()) return Object.keys(DISEASES);
    const q = search.toLowerCase();
    return Object.keys(DISEASES).filter(
      (k) =>
        DISEASES[k].name.toLowerCase().includes(q) ||
        k.toLowerCase().includes(q) ||
        DISEASES[k].description.toLowerCase().includes(q)
    );
  }, [search]);

  const categoryGroups = useMemo(
    () => groupDiseasesByCategory(filteredDiseases).filter((g) => g.diseases.length > 0),
    [filteredDiseases]
  );

  const categoryDiseases = useMemo(
    () => (selectedCategory ? filteredDiseases.filter((k) => DISEASES[k].category === selectedCategory) : []),
    [selectedCategory, filteredDiseases]
  );

  const disease = selectedDisease ? DISEASES[selectedDisease] : null;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setSelectedCategory(null);
    setSelectedDisease(null);
  };

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="p-6">
  <div className="flex items-center gap-3 mb-2">
    <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
      <Stethoscope className="w-6 h-6 text-primary-600 dark:text-primary-400" />
    </div>

    <div>
      <h2 className="text-2xl font-bold dark:text-white">
        {'موسوعة الأمراض'}
      </h2>

      <p className="text-gray-500 dark:text-gray-400">
        {'ابحث وتعلم عن الأمراض الطبية وأعراضها وأسبابها وطرق علاجها.'}
      </p>
    </div>
  </div>

  <div className="relative mt-5">
    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />

    <Input
      value={search}
      onChange={handleSearchChange}
      placeholder={'ابحث عن الأمراض...'}
      className="ps-10"
    />
  </div>
</Card>

      {!selectedCategory && !selectedDisease && (
        <motion.div {...fadeIn}>
          <div className="flex items-center justify-between mb-3">
  <p className="text-sm text-gray-500 dark:text-gray-400">
    {`${categoryGroups.length} فئات طبية`}
  </p>
</div>
          {categoryGroups.length === 0 ? (
            <EmptyState
              icon={<span className="text-4xl">🔍</span>}
              title={'لا توجد فئات'}
              description={'لا توجد فئات طبية تطابق بحثك.'}
            />
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categoryGroups.map((group) => (
                <motion.div key={group.category} variants={staggerItem} className="h-full">
                  <DiseaseCategoryCard
                    category={group.category}
                    diseaseCount={group.diseases.length}
                    onClick={() => setSelectedCategory(group.category)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}

      {selectedCategory && !selectedDisease && (
        <motion.div {...fadeIn} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setSelectedCategory(null)}
              icon={<ArrowLeft className={`w-4 h-4 ${'rotate-180'}`} />}
            >
              {'العودة إلى الفئات'}
            </Button>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {`${categoryDiseases.length} مرض`}
            </p>
          </div>
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categoryDiseases.map((key) => (
              <motion.div key={key} variants={staggerItem}>
                <DiseaseCard
                  name={DISEASES[key].name}
                  description={DISEASES[key].description}
                  onClick={() => setSelectedDisease(key)}
                />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}

      <AnimatePresence>
        {disease && (
          <motion.div {...fadeIn} className="space-y-6">
            <Button
              variant="ghost"
              onClick={() => setSelectedDisease(null)}
              icon={<ArrowLeft className={`w-4 h-4 ${'rotate-180'}`} />}
              className="mb-2"
            >
              {'العودة إلى القائمة'}
            </Button>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              dir="ltr"
              className="relative overflow-hidden rounded-2xl border border-light-border bg-gradient-to-br from-primary-50/70 via-white to-white p-6 text-left shadow-sm dark:border-dark-border dark:from-primary-900/20 dark:via-dark-card dark:to-dark-card md:p-10"
            >
              <div className="pointer-events-none absolute -end-24 -top-28 h-72 w-72 rounded-full bg-primary-100/50 blur-3xl dark:bg-primary-500/10" />
              <div className="pointer-events-none absolute -bottom-32 -start-20 h-64 w-64 rounded-full bg-red-50/60 blur-3xl dark:bg-red-500/5" />

              <div className="relative">
                <DiseaseCategoryBadge category={disease.category} />

                <h2 className="mt-5 text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">
                  {disease.name}
                </h2>

                <p className="mt-4 max-w-3xl text-base leading-relaxed text-gray-600 dark:text-gray-300 md:text-lg">
                  {disease.description}
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <DiseaseStatPill icon={Stethoscope} count={disease.symptoms.length} label={'الأعراض'} accent="red" />
                  <DiseaseStatPill icon={TriangleAlert} count={disease.causes.length} label={'الأسباب'} accent="amber" />
                  <DiseaseStatPill icon={Pill} count={disease.treatment.length} label={'العلاج'} accent="emerald" />
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 gap-5 md:grid-cols-3"
            >
              <DiseaseInfoSection icon={Stethoscope} title={'الأعراض'} items={disease.symptoms} accent="red" />
              <DiseaseInfoSection icon={TriangleAlert} title={'الأسباب'} items={disease.causes} accent="amber" />
              <DiseaseInfoSection icon={Pill} title={'العلاج'} items={disease.treatment} accent="emerald" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
            >
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/70 to-white p-5 shadow-sm dark:border-amber-800/40 dark:from-amber-900/15 dark:to-dark-card">
                <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </span>
                <p className="pt-1 text-sm leading-6 text-amber-800/90 dark:text-amber-200">
                  {"هذه الأداة مخصصة للأغراض التعليمية فقط، وقد تتغير المعلومات الطبية مع مرور الوقت."}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// 5. Disease Compare
// =============================================================================

function DiseaseCompare() {
  const [disease1, setDisease1] = useState('');
  const [disease2, setDisease2] = useState('');

  const diseaseOptions = useMemo(
    () => Object.keys(DISEASES).map((k) => ({ value: k, label: DISEASES[k].name })),
    []
  );

  const d1 = disease1 ? DISEASES[disease1] : null;
  const d2 = disease2 ? DISEASES[disease2] : null;

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-2 dark:text-white">{'مقارنة الأمراض'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{'اختر مرضين لمقارنة الأعراض والأسباب والعلاجات جنباً إلى جنب.'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{'المرض الأول'}</label>
            <Select
              value={disease1}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDisease1(e.target.value)}
              options={[{ value: '', label: 'اختر مرضاً...' }, ...diseaseOptions]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{'المرض الثاني'}</label>
            <Select
              value={disease2}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDisease2(e.target.value)}
              options={[{ value: '', label: 'اختر مرضاً...' }, ...diseaseOptions]}
            />
          </div>
        </div>
      </Card>

      {d1 && d2 && (
        <motion.div {...fadeIn}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[d1, d2].map((d, idx) => (
              <Card key={idx} className="p-6">
                <h3 className="text-xl font-bold mb-3 dark:text-white">{d.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{d.description}</p>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-red-600 dark:text-red-400 mb-1">🩺 {'الأعراض'}</h4>
                    <div className="flex flex-wrap gap-1">
                      {d.symptoms.map((s, i) => (
                        <Chip key={i} variant="danger" className="text-xs" label={s} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-1">⚡ {'الأسباب'}</h4>
                    <div className="flex flex-wrap gap-1">
                      {d.causes.map((c, i) => (
                        <Chip key={i} variant="warning" className="text-xs" label={c} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-green-600 dark:text-green-400 mb-1">💊 {'العلاج'}</h4>
                    <div className="flex flex-wrap gap-1">
                      {d.treatment.map((tr, i) => (
                        <Chip key={i} variant="success" className="text-xs" label={tr} />
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="p-6 mt-4">
            <h3 className="text-lg font-bold mb-3 dark:text-white">{'ملخص المقارنة'}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-2 ps-0 dark:text-gray-300">{'الميزة'}</th>
                    <th className="text-left py-2 dark:text-gray-300">{d1.name}</th>
                    <th className="text-left py-2 pe-0 dark:text-gray-300">{d2.name}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2 ps-0 font-medium dark:text-gray-300">{'عدد الأعراض'}</td>
                    <td className="py-2 dark:text-gray-400">{d1.symptoms.length}</td>
                    <td className="py-2 pe-0 dark:text-gray-400">{d2.symptoms.length}</td>
                  </tr>
                  <tr className="border-b dark:border-gray-700">
                    <td className="py-2 ps-0 font-medium dark:text-gray-300">{'عدد الأسباب'}</td>
                    <td className="py-2 dark:text-gray-400">{d1.causes.length}</td>
                    <td className="py-2 pe-0 dark:text-gray-400">{d2.causes.length}</td>
                  </tr>
                  <tr>
                    <td className="py-2 ps-0 font-medium dark:text-gray-300">{'خيارات العلاج'}</td>
                    <td className="py-2 dark:text-gray-400">{d1.treatment.length}</td>
                    <td className="py-2 pe-0 dark:text-gray-400">{d2.treatment.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

// =============================================================================
// 6. Drug Summary
// =============================================================================

function DrugSummary() {
  const [search, setSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<string | null>(null);

  const filteredDrugs = useMemo(() => {
    if (!search.trim()) return Object.keys(DRUGS);
    const q = search.toLowerCase();
    return Object.keys(DRUGS).filter(
      (k) =>
        DRUGS[k].name.toLowerCase().includes(q) ||
        k.toLowerCase().includes(q) ||
        DRUGS[k].drugClass.toLowerCase().includes(q)
    );
  }, [search]);

  const drug = selectedDrug ? DRUGS[selectedDrug] : null;

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-2 dark:text-white">{'مرجع الأدوية'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{"ابحث عن الأدوية لمعرفة فئتها ودواعي استعمالها وآثارها الجانبية وموانع استعمالها."}</p>
        <Input
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setSelectedDrug(null); }}
          placeholder={'ابحث عن الأدوية باسمها أو باسم العائلة...'}
        />
      </Card>

      {!selectedDrug && (
        <motion.div {...fadeIn}>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{filteredDrugs.length} دواء</p>
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDrugs.map((key) => (
              <motion.div key={key} variants={staggerItem}>
                <Card className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedDrug(key)}>
                  <h3 className="font-semibold dark:text-white">{DRUGS[key].name}</h3>
                  <Badge variant="info" className="mt-1">{DRUGS[key].drugClass}</Badge>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}

      <AnimatePresence>
        {drug && (
          <motion.div {...fadeIn}>
            <Button variant="ghost" onClick={() => setSelectedDrug(null)} className="mb-2">
              ← {'العودة إلى القائمة'}
            </Button>
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-1 dark:text-white">{drug.name}</h2>
              <Badge variant="info" className="mb-4">{drug.drugClass}</Badge>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <h3 className="font-bold text-blue-700 dark:text-blue-300 mb-2"> {'دواعي الاستعمال'}</h3>
                  <ul className="space-y-1">
                    {drug.indications.map((ind, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1">
                        <span className="text-blue-400 mt-1">•</span> {ind}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <h3 className="font-bold text-amber-700 dark:text-amber-300 mb-2"> {'الآثار الجانبية'}</h3>
                  <ul className="space-y-1">
                    {drug.sideEffects.map((se, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1">
                        <span className="text-amber-400 mt-1">•</span> {se}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <h3 className="font-bold text-red-700 dark:text-red-300 mb-2"> {'موانع الاستعمال'}</h3>
                  <ul className="space-y-1">
                    {drug.contraindications.map((ci, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-1">
                        <span className="text-red-400 mt-1">•</span> {ci}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// 7. Lab Values
// =============================================================================

const LAB_CATEGORIES = ['All', ...Array.from(new Set(LAB_VALUES.map((l) => l.category)))];

const CATEGORY_COLORS: Record<string, string> = {
  Hematology: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Chemistry: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Renal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Hepatic: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Endocrine: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  Cardiac: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  Coagulation: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Lipid Panel': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Pancreatic: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Critical Care': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

function LabValuesTool() {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let vals = LAB_VALUES;
    if (category !== 'All') vals = vals.filter((v) => v.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      vals = vals.filter((v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q));
    }
    return vals;
  }, [category, search]);

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-2 dark:text-white">{'القيم المرجعية للمختبر'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{'جدول شامل للقيم المرجعية لفحوصات المختبر الشائعة والقيم الحرجة.'}</p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder={'ابحث عن الفحوصات...'}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {LAB_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat === 'All' ? 'الكل' : cat}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-300">{'اختبار'}</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-300">{'الفئة'}</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-300">{'الوحدة'}</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-300">{'المعدل الطبيعي'}</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-300">{'القيمة الحرجة'}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filtered.map((lab, i) => (
                  <motion.tr
                    key={lab.name}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td dir="ltr" className="py-3 px-4 font-medium dark:text-white">{lab.name}</td>
                    <td dir="ltr" className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[lab.category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {lab.category}
                      </span>
                    </td>
                    <td dir="ltr" className="py-3 px-4 text-gray-500 dark:text-gray-400">{lab.unit}</td>
                    <td dir="ltr" className="py-3 px-4 text-gray-700 dark:text-gray-300">{lab.normalRange}</td>
                    <td dir="ltr" className="py-3 px-4">
                      <span className="text-red-600 dark:text-red-400 font-medium">{lab.criticalHigh}</span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-gray-400 dark:text-gray-500">
            {'لا توجد قيم مخبرية تطابق معاييرك.'}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// =============================================================================
// 8. Medical Notes
// =============================================================================

const NOTE_TEMPLATES = [
  {
    id: 'soap',
    name: 'SOAP Note',
    template: `SUBJECTIVE:\nChief Complaint: \nHistory of Present Illness: \nReview of Systems: \n\nOBJECTIVE:\nVital Signs: \nPhysical Examination: \nLab/Diagnostic Results: \n\nASSESSMENT:\n1. \n2. \n3. \n\nPLAN:\n1. \n2. \n3. `,
  },
  {
    id: 'hp',
    name: 'History & Physical',
    template: `PATIENT HISTORY\n\nChief Complaint: \n\nHistory of Present Illness:\nOnset: \nLocation: \nDuration: \nCharacter: \nAggravating/Alleviating factors: \nRadiation: \nTiming: \nSeverity: \n\nPast Medical History: \nPast Surgical History: \nMedications: \nAllergies: \nFamily History: \nSocial History: \n\nREVIEW OF SYSTEMS:\nGeneral: \nHEENT: \nCardiovascular: \nRespiratory: \nGI: \nGU: \nMSK: \nNeuro: \nPsych: \n\nPHYSICAL EXAMINATION:\nVitals: \nGeneral: \nHEENT: \nNeck: \nChest/Lungs: \nHeart: \nAbdomen: \nExtremities: \nNeuro: \n\nASSESSMENT & PLAN:\n `,
  },
  {
    id: 'progress',
    name: 'Progress Note',
    template: `DATE: ${new Date().toLocaleDateString(APP_DISPLAY_LOCALE)}\n\nSUBJECTIVE:\nPatient reports: \nSymptoms: \n\nOBJECTIVE:\nVitals: \nExam findings: \nNew results: \n\nASSESSMENT:\nCondition: \nResponse to treatment: \n\nPLAN:\n1. \n2. \n3. \nDisposition: `,
  },
  {
    id: 'discharge',
    name: 'Discharge Summary',
    template: `ADMISSION DATE: \nDISCHARGE DATE: \n\nADMITTING DIAGNOSIS: \nDISCHARGE DIAGNOSIS: \n\nHISTORY OF PRESENT ILLNESS:\n\nHOSPITAL COURSE:\n\nPROCEDURES PERFORMED:\n\nCONDITION AT DISCHARGE:\n\nDISCHARGE MEDICATIONS:\n1. \n2. \n3. \n\nFOLLOW-UP:\n- PCP: \n- Specialist: \n\nDISCHARGE INSTRUCTIONS:\nActivity: \nDiet: \nWarning signs: `,
  },
];

function MedicalNotesTool() {
  const [notes, setNotes] = useState<MedicalNote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('SOAP');
  const [isCreating, setIsCreating] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const { addNotification } = useAppStore();

  useEffect(() => {
    setNotes(loadMedicalNotes());
  }, []);

  useEffect(() => {
    saveMedicalNotes(notes);
  }, [notes]);

  const startCreate = useCallback(() => {
    setIsCreating(true);
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
    setEditCategory('SOAP');
  }, []);

  const startEdit = useCallback((note: MedicalNote) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditCategory(note.category);
    setIsCreating(true);
  }, []);

  const saveNote = useCallback(() => {
    if (!editTitle.trim() || !editContent.trim()) {
      addNotification('الرجاء ملء العنوان والمحتوى معاً.', 'warning');
      return;
    }

    if (editingId) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingId
            ? { ...n, title: editTitle.trim(), content: editContent.trim(), category: editCategory, updatedAt: Date.now() }
            : n
        )
      );
      addNotification('تم تحديث الملاحظة!', 'success');
    } else {
      const newNote: MedicalNote = {
        id: `note-${Date.now()}`,
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setNotes((prev) => [newNote, ...prev]);
      addNotification('تم إنشاء الملاحظة!', 'success');
    }
    setIsCreating(false);
    setEditingId(null);
  }, [editTitle, editContent, editCategory, editingId, addNotification]);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    addNotification('تم حذف الملاحظة.', 'info');
  }, [addNotification]);

  const applyTemplate = useCallback((templateId: string) => {
    const tmpl = NOTE_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setEditContent(tmpl.template);
      setEditCategory(tmpl.id.toUpperCase());
    }
    setTemplateModal(false);
  }, []);

  if (isCreating) {
    return (
      <motion.div {...fadeIn} className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => { setIsCreating(false); setEditingId(null); }}>← {'رجوع'}</Button>
          <h2 className="text-xl font-bold dark:text-white">
            {editingId ? 'تعديل الملاحظة' : 'ملاحظة جديدة'}
          </h2>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{'العنوان'}</label>
              <Input
                value={editTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                placeholder={'عنوان الملاحظة...'}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{'الفئة'}</label>
                <Select
                  value={editCategory}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditCategory(e.target.value)}
                  options={[
                    { value: 'SOAP', label: 'SOAP' },
                    { value: 'HP', label: 'H&P' },
                    { value: 'Progress', label: 'Progress' },
                    { value: 'Discharge', label: 'Discharge' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
              </div>
              {!editingId && (
                <div className="pt-5">
                  <Button variant="ghost" onClick={() => setTemplateModal(true)}>
                     {'استخدام القالب'}
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{'المحتوى'}</label>
              <TextArea
                value={editContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                placeholder={'اكتب ملاحظتك هنا...'}
                rows={20}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={saveNote} className="px-6">
                {editingId ? 'تحديث الملاحظة' : 'حفظ الملاحظة'}
              </Button>
              <Button variant="ghost" onClick={() => { setIsCreating(false); setEditingId(null); }}>
                {'إلغاء'}
              </Button>
            </div>
          </div>
        </Card>

        <Modal open={templateModal} onClose={() => setTemplateModal(false)} title={'اختر قالباً'}>
          <div className="space-y-3">
            {NOTE_TEMPLATES.map((tmpl) => (
              <Card key={tmpl.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => applyTemplate(tmpl.id)}>
                <h4 className="font-semibold dark:text-white">{tmpl.name}</h4>
                <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">{tmpl.template.substring(0, 80)}...</p>
              </Card>
            ))}
          </div>
        </Modal>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">{'الملاحظات الطبية'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{'أنشئ وأدر ملاحظات سريرية باستخدام قوالب جاهزة (SOAP، H&P، متابعة، خروج).'}</p>
        </div>
        <Button onClick={startCreate}>+ {'ملاحظة جديدة'}</Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">📝</span>}
          title={'لا توجد ملاحظات بعد'}
          description={'أنشئ أول ملاحظة طبية لك باستخدام قوالمنا الاحترافية.'}
        />
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
          {notes.map((note) => (
            <motion.div key={note.id} variants={staggerItem}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold dark:text-white">{note.title}</h3>
                      <Badge variant="info">{note.category}</Badge>
                    </div>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                      {new Date(note.updatedAt).toLocaleDateString(APP_DISPLAY_LOCALE)} {new Date(note.updatedAt).toLocaleTimeString([APP_DISPLAY_LOCALE], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap line-clamp-3 font-mono">{note.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(note)}>{'تعديل'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteNote(note.id)} className="text-red-500">✕</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
