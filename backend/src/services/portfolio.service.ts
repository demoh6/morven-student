import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

// ---------------------------------------------------------------------------
// Portfolio Builder service.
//
// Serves two audiences:
//  - Students (any authenticated user): read the university/cohort/course
//    catalog and the published PDF template for a given course.
//  - Admins (main ADMIN only, enforced by the route): CRUD over the catalog
//    and the PDF templates.
//
// The uploaded PDF is the source of truth. Its bytes are stored in PostgreSQL
// (same approach as StoredImage) and exchanged with the client as a base64
// data URL so the existing client-side PDF pipeline is unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

// The university form was simplified to only require the name. The remaining
// columns are kept (and still accepted by the API for backward compatibility)
// but are now optional; the service fills safe defaults on create and leaves
// existing values untouched on update.
export const universitySchema = z.object({
  name: z.string().min(1, "اسم الجامعة مطلوب").max(200, "الاسم طويل جداً").trim(),
  nameEn: z.string().max(200, "الاسم طويل جداً").trim().optional().nullable(),
  city: z.string().max(100, "المدينة طويلة جداً").trim().optional().nullable(),
  shortCode: z.string().max(10, "الرمز طويل جداً").trim().optional().nullable(),
  color: z.string().max(30, "اللون طويل جداً").trim().optional().nullable(),
  established: z.number().int("سنة التأسيس غير صالحة").min(1000).max(3000).optional().nullable(),
  students: z.string().max(50, "القيمة طويلة جداً").trim().optional().nullable(),
});

export const updateUniversitySchema = universitySchema.partial();

export const cohortSchema = z.object({
  universityId: z.string().min(1, "الجامعة مطلوبة"),
  label: z.string().min(1, "اسم الدفعة مطلوب").max(200, "الاسم طويل جداً").trim(),
  order: z.number().int("الترتيب غير صالح").min(1),
  academicYears: z.string().min(1, "السنوات الأكاديمية مطلوبة").max(100, "القيمة طويلة جداً").trim(),
  description: z.string().max(500, "الوصف طويل جداً").trim().optional().nullable(),
});

export const updateCohortSchema = cohortSchema.partial();

export const courseSchema = z.object({
  universityId: z.string().min(1, "الجامعة مطلوبة"),
  name: z.string().min(1, "اسم المقرر مطلوب").max(200, "الاسم طويل جداً").trim(),
  code: z.string().max(30, "الرمز طويل جداً").trim().optional().nullable(),
  description: z.string().max(500, "الوصف طويل جداً").trim().default(""),
  portfolioKind: z.string().min(1, "نوع الملف مطلوب").max(100, "القيمة طويلة جداً").trim(),
  batchIds: z.array(z.string()).default([]),
});

export const updateCourseSchema = courseSchema.partial();

const templateFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "عنوان الحقل مطلوب").max(200),
  type: z.enum(["TEXT", "TEXTAREA", "IMAGE"]),
  page: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  defaultValue: z.string().default(""),
  required: z.boolean().default(false),
  originalText: z.string().optional(),
  fontSize: z.number().optional(),
});

export const templateSchema = z.object({
  name: z.string().min(1, "اسم القالب مطلوب").max(300, "الاسم طويل جداً").trim(),
  universityId: z.string().min(1, "الجامعة مطلوبة"),
  cohortId: z.string().min(1, "الدفعة مطلوبة"),
  courseId: z.string().min(1, "المقرر مطلوب"),
  kind: z.string().min(1, "نوع الملف مطلوب").max(100, "القيمة طويلة جداً").trim(),
  specialty: z.string().max(200, "التخصص طويل جداً").trim().optional().nullable(),
  status: z.enum(["draft", "published"]).default("draft"),
  pdfName: z.string().max(300, "اسم الملف طويل جداً").default(""),
  pdfDataUrl: z.string().optional().nullable(),
  fields: z.array(templateFieldSchema).default([]),
});

export const updateTemplateSchema = templateSchema.partial();

export const templateStatusSchema = z.object({
  status: z.enum(["draft", "published"]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePdfDataUrl(dataUrl: string): Uint8Array<ArrayBuffer> | null {
  const match = /^data:application\/pdf;base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  // Prisma's Bytes column is typed as Uint8Array<ArrayBuffer>; Buffer.from can
  // be ArrayBufferLike-backed, so copy into an explicitly ArrayBuffer-backed view.
  const buf = Buffer.from(match[1], "base64");
  const bytes = new Uint8Array(new ArrayBuffer(buf.length));
  bytes.set(buf);
  return bytes;
}

function toPdfDataUrl(bytes: Uint8Array | null | undefined): string | null {
  if (!bytes || bytes.length === 0) return null;
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

type UniversityRow = Prisma.UniversityGetPayload<{}>;
type CohortRow = Prisma.CohortGetPayload<{}>;
type CourseRow = Prisma.CourseGetPayload<{ include: { cohorts: true } }>;
type TemplateRow = Prisma.PortfolioTemplateGetPayload<{}>;

function sanitizeUniversity(u: UniversityRow) {
  return {
    id: u.id,
    name: u.name,
    nameEn: u.nameEn ?? "",
    city: u.city,
    shortCode: u.shortCode,
    color: u.color,
    established: u.established,
    students: u.students,
  };
}

function sanitizeCohort(c: CohortRow) {
  return {
    id: c.id,
    universityId: c.universityId,
    label: c.label,
    order: c.sortOrder,
    academicYears: c.academicYears,
    description: c.description ?? "",
  };
}

function sanitizeCourse(c: CourseRow) {
  return {
    id: c.id,
    universityId: c.universityId,
    batchIds: c.cohorts.map((cc) => cc.cohortId),
    name: c.name,
    code: c.code ?? undefined,
    description: c.description,
    portfolioKind: c.portfolioKind,
  };
}

function sanitizeTemplate(t: TemplateRow, opts: { includePdf: boolean }) {
  return {
    id: t.id,
    name: t.name,
    universityId: t.universityId,
    batchId: t.cohortId,
    subjectId: t.courseId,
    kind: t.kind,
    specialty: t.specialty ?? "",
    status: t.status,
    pdfName: t.pdfName,
    pdfBytesLength: t.pdfBytes ? t.pdfBytes.length : 0,
    ...(opts.includePdf ? { pdfDataUrl: toPdfDataUrl(t.pdfBytes) } : {}),
    fields: (t.fields as unknown[]) ?? [],
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  };
}

async function getTemplateOrThrow(templateId: string): Promise<TemplateRow> {
  const template = await prisma.portfolioTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new PortfolioError("القالب غير موجود", 404);
  return template;
}

// ---------------------------------------------------------------------------
// Catalog — read (any authenticated user)
// ---------------------------------------------------------------------------

export async function listUniversities() {
  const universities = await prisma.university.findMany({ orderBy: { name: "asc" } });
  return universities.map(sanitizeUniversity);
}

/** Full catalog (universities + cohorts + courses) in a single round-trip. */
export async function getCatalog() {
  const [universities, cohorts, courses] = await Promise.all([
    prisma.university.findMany({ orderBy: { name: "asc" } }),
    prisma.cohort.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.course.findMany({ include: { cohorts: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    universities: universities.map(sanitizeUniversity),
    cohorts: cohorts.map(sanitizeCohort),
    courses: courses.map(sanitizeCourse),
  };
}

export async function listCohorts(universityId: string) {
  const cohorts = await prisma.cohort.findMany({
    where: { universityId },
    orderBy: { sortOrder: "asc" },
  });
  return cohorts.map(sanitizeCohort);
}

export async function listCourses(universityId: string, cohortId?: string) {
  const courses = await prisma.course.findMany({
    where: {
      universityId,
      ...(cohortId ? { cohorts: { some: { cohortId } } } : {}),
    },
    include: { cohorts: true },
    orderBy: { name: "asc" },
  });
  return courses.map(sanitizeCourse);
}

/** Published template for a course, including its PDF bytes, or null. */
export async function getPublishedTemplate(universityId: string, cohortId: string, courseId: string) {
  const template = await prisma.portfolioTemplate.findFirst({
    where: { universityId, cohortId, courseId, status: "published" },
    orderBy: { updatedAt: "desc" },
  });
  if (!template) return null;
  return sanitizeTemplate(template, { includePdf: true });
}

// ---------------------------------------------------------------------------
// Catalog — admin CRUD
// ---------------------------------------------------------------------------

export async function adminListUniversities() {
  const universities = await prisma.university.findMany({ orderBy: { createdAt: "asc" } });
  return universities.map(sanitizeUniversity);
}

export async function createUniversity(input: z.infer<typeof universitySchema>) {
  // Only the name is required from the (simplified) admin form. The remaining
  // NOT NULL columns receive safe defaults so the existing schema is unchanged.
  const shortCode = (input.shortCode ?? "").trim() || input.name.replace(/\s+/g, "").slice(0, 4);
  try {
    const university = await prisma.university.create({
      data: {
        name: input.name,
        nameEn: input.nameEn ?? null,
        city: input.city ?? "",
        shortCode,
        color: input.color ?? "#1b5e20",
        established: input.established ?? new Date().getFullYear(),
        students: input.students ?? "",
      },
    });
    return sanitizeUniversity(university);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PortfolioError("توجد جامعة أخرى بالاسم نفسه", 409, "DUPLICATE_UNIVERSITY");
    }
    throw err;
  }
}

export async function updateUniversity(id: string, input: z.infer<typeof updateUniversitySchema>) {
  await assertUniversityExists(id);
  try {
    const university = await prisma.university.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.city !== undefined ? { city: input.city ?? "" } : {}),
        ...(input.shortCode !== undefined ? { shortCode: input.shortCode ?? "" } : {}),
        ...(input.color !== undefined ? { color: input.color ?? "#1b5e20" } : {}),
        ...(input.established !== undefined
          ? { established: input.established ?? new Date().getFullYear() }
          : {}),
        ...(input.students !== undefined ? { students: input.students ?? "" } : {}),
      },
    });
    return sanitizeUniversity(university);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PortfolioError("توجد جامعة أخرى بالاسم نفسه", 409, "DUPLICATE_UNIVERSITY");
    }
    throw err;
  }
}

export async function deleteUniversity(id: string) {
  await assertUniversityExists(id);
  const [cohorts, courses, templates] = await Promise.all([
    prisma.cohort.count({ where: { universityId: id } }),
    prisma.course.count({ where: { universityId: id } }),
    prisma.portfolioTemplate.count({ where: { universityId: id } }),
  ]);
  if (cohorts > 0 || courses > 0 || templates > 0) {
    throw new PortfolioError(
      `لا يمكن حذف الجامعة لارتباطها بـ ${cohorts} دفعة و${courses} مقرر و${templates} قالب. احذف العناصر التابعة أولاً.`,
      409,
      "UNIVERSITY_HAS_DEPENDENTS",
    );
  }
  await prisma.university.delete({ where: { id } });
}

async function assertUniversityExists(id: string) {
  const university = await prisma.university.findUnique({ where: { id }, select: { id: true } });
  if (!university) throw new PortfolioError("الجامعة غير موجودة", 404);
}

export async function adminListCohorts(universityId?: string) {
  const cohorts = await prisma.cohort.findMany({
    where: universityId ? { universityId } : {},
    orderBy: [{ universityId: "asc" }, { sortOrder: "asc" }],
  });
  return cohorts.map(sanitizeCohort);
}

export async function createCohort(input: z.infer<typeof cohortSchema>) {
  await assertUniversityExists(input.universityId);
  try {
    const cohort = await prisma.cohort.create({
      data: {
        universityId: input.universityId,
        label: input.label,
        sortOrder: input.order,
        academicYears: input.academicYears,
        description: input.description ?? null,
      },
    });
    return sanitizeCohort(cohort);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PortfolioError("توجد دفعة أخرى بالاسم نفسه في هذه الجامعة", 409, "DUPLICATE_COHORT");
    }
    throw err;
  }
}

export async function updateCohort(id: string, input: z.infer<typeof updateCohortSchema>) {
  await assertCohortExists(id);
  try {
    const cohort = await prisma.cohort.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.order !== undefined ? { sortOrder: input.order } : {}),
        ...(input.academicYears !== undefined ? { academicYears: input.academicYears } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      },
    });
    return sanitizeCohort(cohort);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PortfolioError("توجد دفعة أخرى بالاسم نفسه في هذه الجامعة", 409, "DUPLICATE_COHORT");
    }
    throw err;
  }
}

export async function deleteCohort(id: string) {
  await assertCohortExists(id);
  const [courses, templates] = await Promise.all([
    prisma.courseCohort.count({ where: { cohortId: id } }),
    prisma.portfolioTemplate.count({ where: { cohortId: id } }),
  ]);
  if (courses > 0 || templates > 0) {
    throw new PortfolioError(
      `لا يمكن حذف الدفعة لارتباطها بـ ${courses} مقرر و${templates} قالب. افصل المقررات والِقوالب المرتبطة أولاً.`,
      409,
      "COHORT_HAS_DEPENDENTS",
    );
  }
  await prisma.cohort.delete({ where: { id } });
}

async function assertCohortExists(id: string) {
  const cohort = await prisma.cohort.findUnique({ where: { id }, select: { id: true } });
  if (!cohort) throw new PortfolioError("الدفعة غير موجودة", 404);
}

export async function adminListCourses(universityId?: string) {
  const courses = await prisma.course.findMany({
    where: universityId ? { universityId } : {},
    include: { cohorts: true },
    orderBy: [{ universityId: "asc" }, { name: "asc" }],
  });
  return courses.map(sanitizeCourse);
}

export async function createCourse(input: z.infer<typeof courseSchema>) {
  await assertUniversityExists(input.universityId);
  const cohortIds = input.batchIds ?? [];
  await assertCohortsBelongToUniversity(cohortIds, input.universityId);

  try {
    const course = await prisma.course.create({
      data: {
        universityId: input.universityId,
        name: input.name,
        code: input.code ?? null,
        description: input.description ?? "",
        portfolioKind: input.portfolioKind,
        cohorts: {
          create: cohortIds.map((cohortId) => ({ cohortId })),
        },
      },
      include: { cohorts: true },
    });
    return sanitizeCourse(course);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PortfolioError("يوجد مقرر آخر بالاسم نفسه في هذه الجامعة", 409, "DUPLICATE_COURSE");
    }
    throw err;
  }
}

export async function updateCourse(id: string, input: z.infer<typeof updateCourseSchema>) {
  const existing = await getCourseOrThrow(id);
  if (input.batchIds !== undefined) {
    await assertCohortsBelongToUniversity(input.batchIds, existing.universityId);
  }

  try {
    const course = await prisma.$transaction(async (tx) => {
      if (input.batchIds !== undefined) {
        await tx.courseCohort.deleteMany({ where: { courseId: id } });
        if (input.batchIds.length > 0) {
          await tx.courseCohort.createMany({
            data: input.batchIds.map((cohortId) => ({ courseId: id, cohortId })),
          });
        }
      }
      return tx.course.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code ?? null } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.portfolioKind !== undefined ? { portfolioKind: input.portfolioKind } : {}),
        },
        include: { cohorts: true },
      });
    });
    return sanitizeCourse(course);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new PortfolioError("يوجد مقرر آخر بالاسم نفسه في هذه الجامعة", 409, "DUPLICATE_COURSE");
    }
    throw err;
  }
}

export async function deleteCourse(id: string) {
  await getCourseOrThrow(id);
  const templates = await prisma.portfolioTemplate.count({ where: { courseId: id } });
  if (templates > 0) {
    throw new PortfolioError(
      `لا يمكن حذف المقرر لارتباطه بـ ${templates} قالب. احذف القوالب المرتبطة أولاً.`,
      409,
      "COURSE_HAS_DEPENDENTS",
    );
  }
  await prisma.course.delete({ where: { id } });
}

async function getCourseOrThrow(id: string) {
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw new PortfolioError("المقرر غير موجود", 404);
  return course;
}

async function assertCohortsBelongToUniversity(cohortIds: string[], universityId: string) {
  if (cohortIds.length === 0) return;
  const count = await prisma.cohort.count({
    where: { id: { in: cohortIds }, universityId },
  });
  if (count !== new Set(cohortIds).size) {
    throw new PortfolioError("بعض الدفعات لا تنتمي إلى الجامعة المحددة", 400);
  }
}

// ---------------------------------------------------------------------------
// Templates — admin CRUD
// ---------------------------------------------------------------------------

export async function adminListTemplates(universityId?: string) {
  const templates = await prisma.portfolioTemplate.findMany({
    where: universityId ? { universityId } : {},
    orderBy: { createdAt: "desc" },
  });
  return templates.map((t) => sanitizeTemplate(t, { includePdf: true }));
}

export async function getTemplateDetails(templateId: string) {
  const template = await getTemplateOrThrow(templateId);
  return sanitizeTemplate(template, { includePdf: true });
}

export async function createTemplate(input: z.infer<typeof templateSchema>) {
  await assertRelations(input.universityId, input.cohortId, input.courseId);
  const pdfBytes = input.pdfDataUrl ? parsePdfDataUrl(input.pdfDataUrl) : null;

  const template = await prisma.portfolioTemplate.create({
    data: {
      name: input.name,
      universityId: input.universityId,
      cohortId: input.cohortId,
      courseId: input.courseId,
      kind: input.kind,
      specialty: input.specialty ?? null,
      status: input.status,
      pdfName: input.pdfName ?? "",
      pdfBytes,
      fields: input.fields as unknown as Prisma.InputJsonValue,
    },
  });
  return sanitizeTemplate(template, { includePdf: false });
}

export async function updateTemplate(templateId: string, input: z.infer<typeof updateTemplateSchema>) {
  const existing = await getTemplateOrThrow(templateId);
  const universityId = input.universityId ?? existing.universityId;
  const cohortId = input.cohortId ?? existing.cohortId;
  const courseId = input.courseId ?? existing.courseId;
  await assertRelations(universityId, cohortId, courseId);

  const pdfBytes =
    input.pdfDataUrl !== undefined
      ? input.pdfDataUrl
        ? parsePdfDataUrl(input.pdfDataUrl)
        : null
      : undefined;

  const template = await prisma.portfolioTemplate.update({
    where: { id: templateId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      universityId,
      cohortId,
      courseId,
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.specialty !== undefined ? { specialty: input.specialty || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.pdfName !== undefined ? { pdfName: input.pdfName } : {}),
      ...(pdfBytes !== undefined ? { pdfBytes } : {}),
      ...(input.fields !== undefined
        ? { fields: input.fields as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  return sanitizeTemplate(template, { includePdf: false });
}

export async function setTemplateStatus(templateId: string, status: "draft" | "published") {
  await getTemplateOrThrow(templateId);
  const template = await prisma.portfolioTemplate.update({
    where: { id: templateId },
    data: { status },
  });
  return sanitizeTemplate(template, { includePdf: false });
}

export async function deleteTemplate(templateId: string) {
  await getTemplateOrThrow(templateId);
  await prisma.portfolioTemplate.delete({ where: { id: templateId } });
}

async function assertRelations(universityId: string, cohortId: string, courseId: string) {
  const [cohort, course] = await Promise.all([
    prisma.cohort.findFirst({ where: { id: cohortId, universityId }, select: { id: true } }),
    prisma.course.findFirst({ where: { id: courseId, universityId }, select: { id: true } }),
  ]);
  if (!cohort) throw new PortfolioError("الدفعة لا تنتمي إلى الجامعة المحددة", 400);
  if (!course) throw new PortfolioError("المقرر لا ينتمي إلى الجامعة المحددة", 400);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PortfolioError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PortfolioError";
    this.status = status;
    this.code = code;
  }
}
