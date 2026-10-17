-- Add an optional specialty (التخصص) to admin-authored portfolio templates.
-- Purely additive: existing templates keep NULL and no data is changed.

-- AlterTable
ALTER TABLE "portfolio_templates" ADD COLUMN "specialty" TEXT;
