-- Phone and next-of-kin become optional on a guard.
--
-- A guard is often registered from a paper form before they have produced a
-- phone number or named a next of kin. Requiring them meant the record could
-- not be created at all, so the guard existed on paper and nowhere else.
--
-- Dropping NOT NULL only widens what the column accepts; every existing row
-- already holds a value and is untouched.
ALTER TABLE "Guard" ALTER COLUMN "phone"          DROP NOT NULL;
ALTER TABLE "Guard" ALTER COLUMN "nextOfKinName"  DROP NOT NULL;
ALTER TABLE "Guard" ALTER COLUMN "nextOfKinPhone" DROP NOT NULL;
