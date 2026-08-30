-- Explicit mobile-money details per guard, overriding what is inferred.
--
-- The network is derived from the phone prefix, which throws on a range the
-- list does not know. The account name is assembled from the legal name, which
-- need not match what is registered on the wallet. Both are optional: nothing
-- changes for a guard that leaves them unset.

ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "mobileNetwork"   TEXT;
ALTER TABLE "Guard" ADD COLUMN IF NOT EXISTS "momoAccountName" TEXT;
