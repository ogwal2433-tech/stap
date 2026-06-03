-- AlterTable: add effectiveServiceStart to Guard
-- NULL means "use contractStart as the increment anniversary baseline"
ALTER TABLE "Guard"
  ADD COLUMN IF NOT EXISTS "effectiveServiceStart" TIMESTAMP(3);
