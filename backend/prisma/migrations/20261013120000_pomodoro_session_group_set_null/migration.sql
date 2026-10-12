-- Personal focus sessions must survive the lifecycle of any group they were
-- recorded under. Group rankings are now derived at the USER level, so
-- `group_id` is informational and a deleted group must not cascade-delete the
-- user's focus history.

-- DropForeignKey
ALTER TABLE "pomodoro_sessions" DROP CONSTRAINT "pomodoro_sessions_group_id_fkey";

-- AlterTable
ALTER TABLE "pomodoro_sessions" ALTER COLUMN "group_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "pomodoro_sessions" ADD CONSTRAINT "pomodoro_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "pomodoro_sessions_user_id_completed_at_idx" ON "pomodoro_sessions"("user_id", "completed_at");
