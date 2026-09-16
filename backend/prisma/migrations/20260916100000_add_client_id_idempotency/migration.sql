-- AlterTable
ALTER TABLE "exams" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "exams_user_id_client_id_key" ON "exams"("user_id", "client_id");

-- AlterTable
ALTER TABLE "flashcards" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "flashcards_user_id_client_id_key" ON "flashcards"("user_id", "client_id");

-- AlterTable
ALTER TABLE "notes" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notes_user_id_client_id_key" ON "notes"("user_id", "client_id");

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tasks_user_id_client_id_key" ON "tasks"("user_id", "client_id");

-- AlterTable
ALTER TABLE "user_files" ADD COLUMN "client_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_files_user_id_client_id_key" ON "user_files"("user_id", "client_id");