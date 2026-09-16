import { z } from "zod";
import prisma from "../lib/prisma";
import { UserDataError } from "./userDataError";
import { createWithClientId } from "./createWithClientId";

// ---------------------------------------------------------------------------
// Validation schemas
//
// Mirrors the frontend ExamCountdown shape (src/types/index.ts):
//   id, name, date ('YYYY-MM-DD' local string), color, createdAt (ms).
// ---------------------------------------------------------------------------

export const createExamSchema = z.object({
  name: z.string().trim().min(1, "اسم الامتحان مطلوب").max(200, "الاسم طويل جداً"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD"),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "اللون يجب أن يكون بصيغة Hex"),
  // Stable client-generated id used for idempotent guest→account migration.
  clientId: z.string().trim().min(1, "معرّف العميل مطلوب").max(64, "معرّف العميل طويل جداً").optional(),
});

export const updateExamSchema = createExamSchema.partial();

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;

type PrismaExam = {
  id: string;
  name: string;
  date: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Serialise a DB exam into the frontend ExamCountdown shape. */
export function serializeExam(exam: PrismaExam) {
  return {
    id: exam.id,
    name: exam.name,
    date: exam.date,
    color: exam.color,
    createdAt: exam.createdAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** List the current user's exams, newest first. */
export async function listMyExams(userId: string) {
  const exams = await prisma.exam.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return exams.map(serializeExam);
}

/** Create an exam owned by the authenticated user (idempotent via clientId). */
export async function createMyExam(userId: string, input: CreateExamInput) {
  return createWithClientId(
    (clientId) =>
      prisma.exam
        .findFirst({ where: { userId, clientId } })
        .then((e) => (e ? serializeExam(e) : null)),
    async () => {
      const exam = await prisma.exam.create({
        data: {
          userId,
          name: input.name,
          date: input.date,
          color: input.color,
          clientId: input.clientId ?? null,
        },
      });
      return serializeExam(exam);
    },
    input.clientId
  );
}

/** Update one of the current user's exams (ownership-scoped). */
export async function updateMyExam(
  userId: string,
  examId: string,
  input: UpdateExamInput
) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.date !== undefined) data.date = input.date;
  if (input.color !== undefined) data.color = input.color;

  const result = await prisma.exam.updateMany({
    where: { id: examId, userId },
    data,
  });
  if (result.count === 0) {
    throw new UserDataError("الامتحان غير موجود", 404);
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  return serializeExam(exam!);
}

/** Delete one of the current user's exams (ownership-scoped). */
export async function deleteMyExam(userId: string, examId: string) {
  const result = await prisma.exam.deleteMany({
    where: { id: examId, userId },
  });
  if (result.count === 0) {
    throw new UserDataError("الامتحان غير موجود", 404);
  }
}