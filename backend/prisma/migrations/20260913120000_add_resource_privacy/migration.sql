-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "access_code_ciphertext" TEXT,
ADD COLUMN     "access_code_hash" TEXT,
ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "resource_accesses" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_accesses_user_id_idx" ON "resource_accesses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_accesses_resource_id_user_id_key" ON "resource_accesses"("resource_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "resources_access_code_hash_key" ON "resources"("access_code_hash");

-- AddForeignKey
ALTER TABLE "resource_accesses" ADD CONSTRAINT "resource_accesses_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_accesses" ADD CONSTRAINT "resource_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;