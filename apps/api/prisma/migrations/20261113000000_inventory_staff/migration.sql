ALTER TABLE "InventoryTransaction" ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES "User"("id");
