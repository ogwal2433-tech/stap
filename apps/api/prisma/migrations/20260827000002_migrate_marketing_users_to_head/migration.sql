-- Existing marketing staff become MARKETING_HEAD.
--
-- The safe direction of the two: a head who should have been sales keeps access
-- they then lose, whereas defaulting to SALES would hide every colleague's lead
-- from whoever runs marketing until someone noticed. Reassign individuals to
-- SALES from the staff directory afterwards.

UPDATE "User"
SET role = 'MARKETING_HEAD', "updatedAt" = NOW()
WHERE role = 'MARKETING';
