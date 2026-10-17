-- Portfolio Builder persistence (universities, cohorts, courses, templates).

-- CreateTable
CREATE TABLE "universities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "city" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "established" INTEGER NOT NULL,
    "students" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "id" TEXT NOT NULL,
    "university_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "academic_years" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "university_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "portfolio_kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_cohorts" (
    "course_id" TEXT NOT NULL,
    "cohort_id" TEXT NOT NULL,

    CONSTRAINT "course_cohorts_pkey" PRIMARY KEY ("course_id","cohort_id")
);

-- CreateTable
CREATE TABLE "portfolio_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "university_id" TEXT NOT NULL,
    "cohort_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pdf_name" TEXT NOT NULL,
    "pdf_bytes" BYTEA,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "universities_name_key" ON "universities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_university_id_label_key" ON "cohorts"("university_id", "label");

-- CreateIndex
CREATE INDEX "cohorts_university_id_idx" ON "cohorts"("university_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_university_id_name_key" ON "courses"("university_id", "name");

-- CreateIndex
CREATE INDEX "courses_university_id_idx" ON "courses"("university_id");

-- CreateIndex
CREATE INDEX "course_cohorts_cohort_id_idx" ON "course_cohorts"("cohort_id");

-- CreateIndex
CREATE INDEX "portfolio_templates_university_id_cohort_id_course_id_idx" ON "portfolio_templates"("university_id", "cohort_id", "course_id");

-- CreateIndex
CREATE INDEX "portfolio_templates_status_idx" ON "portfolio_templates"("status");

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_cohorts" ADD CONSTRAINT "course_cohorts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_cohorts" ADD CONSTRAINT "course_cohorts_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_templates" ADD CONSTRAINT "portfolio_templates_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_templates" ADD CONSTRAINT "portfolio_templates_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_templates" ADD CONSTRAINT "portfolio_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The catalog (universities / cohorts / courses) is intentionally NOT seeded:
-- the main admin recreates it from the admin dashboard so it reflects the
-- institutions Morven actually needs. No hardcoded sample records are inserted.
