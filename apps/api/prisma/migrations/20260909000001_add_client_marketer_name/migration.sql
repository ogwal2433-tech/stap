-- The marketer who brought a client in. Nullable and unconstrained: it is only
-- meaningful when leadSource is 'MARKETER', which the service enforces by
-- clearing this column whenever the source is anything else. Expressing that as
-- a CHECK would need leadSource to be an enum column rather than free text, and
-- every row written before MARKETER existed would have to be validated against
-- a rule that did not apply when it was saved.
ALTER TABLE "Client" ADD COLUMN "marketerName" TEXT;
