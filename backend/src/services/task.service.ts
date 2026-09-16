import { z } from "zod";
import prisma from "../lib/prisma";
import { UserDataError } from "./userDataError";
import { createWithClientId } from "./createWithClientId";

// ---------------------------------------------------------------------------
// Validation schemas
//
// Field names/values mirror the frontend Task shape
// (src/types/index.ts) so Phase 3 can wire the local store to these
// endpoints without reshaping the data:
//   priority  -> 'low' | 'medium' | 'high'
//   taskType  -> 'normal' | 'daily'
//   dueDate   -> local calendar date string 'YYYY-MM-DD'
//   dailyTime -> local clock string 'HH:mm'
// ---------------------------------------------------------------------------

const priorityValue = z.enum(["low", "medium", "high"]);

const taskTypeValue = z.enum(["normal", "daily"]);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD");

const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "الوقت يجب أن يكون بصيغة HH:mm");

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "عنوان المهمة مطلوب").max(200, "عنوان المهمة طويل جداً"),
  description: z
    .string()
    .max(5000, "الوصف طويل جداً")
    .trim()
    .nullable()
    .optional(),
  completed: z.boolean().optional(),
  priority: priorityValue.optional(),
  dueDate: dateString.nullable().optional(),
  taskType: taskTypeValue.optional(),
  dailyTime: timeString.nullable().optional(),
  // Stable client-generated id used for idempotent guest→account migration.
  clientId: z.string().trim().min(1, "معرّف العميل مطلوب").max(64, "معرّف العميل طويل جداً").optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

const PRIORITY_MAP = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
} as const;

const TASK_TYPE_MAP = {
  normal: "NORMAL",
  daily: "DAILY",
} as const;

type PrismaTask = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: string;
  dueDate: string | null;
  taskType: string;
  dailyTime: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Serialise a DB task into the frontend Task shape (epoch-ms timestamps). */
export function serializeTask(task: PrismaTask) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    completed: task.completed,
    priority: task.priority.toLowerCase(),
    dueDate: task.dueDate ?? undefined,
    taskType: task.taskType.toLowerCase() as "normal" | "daily",
    dailyTime: task.dailyTime ?? undefined,
    createdAt: task.createdAt.getTime(),
    updatedAt: task.updatedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** List the current user's tasks, newest first. */
export async function listMyTasks(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return tasks.map(serializeTask);
}

/** Create a task owned by the authenticated user (idempotent via clientId). */
export async function createMyTask(userId: string, input: CreateTaskInput) {
  return createWithClientId(
    (clientId) =>
      prisma.task
        .findFirst({ where: { userId, clientId } })
        .then((t) => (t ? serializeTask(t) : null)),
    async () => {
      const task = await prisma.task.create({
        data: {
          userId,
          title: input.title,
          description: input.description ?? null,
          completed: input.completed ?? false,
          priority: input.priority ? PRIORITY_MAP[input.priority] : "MEDIUM",
          dueDate: input.dueDate ?? null,
          taskType: input.taskType ? TASK_TYPE_MAP[input.taskType] : "NORMAL",
          dailyTime: input.dailyTime ?? null,
          clientId: input.clientId ?? null,
        },
      });
      return serializeTask(task);
    },
    input.clientId
  );
}

/**
 * Update one of the current user's tasks. The id alone is never trusted:
 * the ownership condition (id + userId) is part of the update, so a task
 * belonging to another user is indistinguishable from a missing one.
 */
export async function updateMyTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.completed !== undefined) data.completed = input.completed;
  if (input.priority !== undefined) data.priority = PRIORITY_MAP[input.priority];
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ?? null;
  if (input.taskType !== undefined) data.taskType = TASK_TYPE_MAP[input.taskType];
  if (input.dailyTime !== undefined) data.dailyTime = input.dailyTime ?? null;

  const result = await prisma.task.updateMany({
    where: { id: taskId, userId },
    data,
  });
  if (result.count === 0) {
    throw new UserDataError("المهمة غير موجودة", 404);
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  return serializeTask(task!);
}

/** Delete one of the current user's tasks (ownership-scoped). */
export async function deleteMyTask(userId: string, taskId: string) {
  const result = await prisma.task.deleteMany({
    where: { id: taskId, userId },
  });
  if (result.count === 0) {
    throw new UserDataError("المهمة غير موجودة", 404);
  }
}