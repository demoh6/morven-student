export type PortfolioFieldType = 'TEXT' | 'TEXTAREA' | 'IMAGE';

export interface PortfolioSection {
  id: string;
  title: string;
  description?: string;
}

export type PortfolioFieldValue = string;

export interface PortfolioField {
  id: string;
  label: string;
  type: PortfolioFieldType;
  value: PortfolioFieldValue;
  defaultValue: PortfolioFieldValue;
  required: boolean;
  placeholder: string;
  helperText?: string;
  sectionId: string;
}

export interface MockUniversity {
  id: string;
  name: string;
  nameEn: string;
  city: string;
  shortCode: string;
  color: string;
  established: number;
  students: string;
}

export interface MockBatch {
  id: string;
  universityId: string;
  label: string;
  order: number;
  academicYears: string;
  description?: string;
}

export interface MockSubject {
  id: string;
  universityId: string;
  batchIds: string[];
  name: string;
  code?: string;
  description: string;
  portfolioKind: string;
}

export interface PortfolioTemplate {
  id: string;
  subjectId: string;
  kind: string;
  documentTitle: string;
  coverFieldIds: string[];
  infoFieldIds: string[];
  bodySectionIds: string[];
}

export interface StudentSelection {
  universityId: string;
  batchId: string;
  subjectId: string;
}

export interface EditorDraft {
  fields: PortfolioField[];
  templateId: string;
}

export interface PortfolioFieldDraft {
  id: string | null;
  label: string;
  type: PortfolioFieldType;
  defaultValue: string;
  required: boolean;
  regionKey: string;
}