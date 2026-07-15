import prisma from '../db/prisma';

export type IdPrefix = 'SSLG' | 'SSLC' | 'SSLS';

export function formatSystemId(prefix: IdPrefix, number: number): string {
  return `${prefix}${number.toString().padStart(3, '0')}`;
}

async function getMaxSystemIdNumber(prefix: IdPrefix): Promise<number> {
  let result: { max_num: number | null }[];

  if (prefix === 'SSLG') {
    result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(
        CAST(REGEXP_REPLACE("systemId", '[^0-9]', '', 'g') AS INTEGER)
      ) AS max_num
      FROM "Guard"
      WHERE "systemId" LIKE 'SSLG%'
        AND "systemId" ~ '^SSLG[0-9]+$'
    `;
  } else if (prefix === 'SSLC') {
    result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(
        CAST(REGEXP_REPLACE("systemId", '[^0-9]', '', 'g') AS INTEGER)
      ) AS max_num
      FROM "Client"
      WHERE "systemId" LIKE 'SSLC%'
        AND "systemId" ~ '^SSLC[0-9]+$'
    `;
  } else {
    result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(
        CAST(REGEXP_REPLACE("systemId", '[^0-9]', '', 'g') AS INTEGER)
      ) AS max_num
      FROM "User"
      WHERE "systemId" LIKE 'SSLS%'
        AND "systemId" ~ '^SSLS[0-9]+$'
    `;
  }

  return result[0]?.max_num ?? 0;
}

async function getNextSystemId(prefix: IdPrefix): Promise<string> {
  const maxNumber = await getMaxSystemIdNumber(prefix);
  return formatSystemId(prefix, maxNumber + 1);
}

// Reserves `count` sequential IDs in one round trip — for batch inserts
// (e.g. bulk import) where generating one-at-a-time per row isn't practical.
async function getNextSystemIds(prefix: IdPrefix, count: number): Promise<string[]> {
  const maxNumber = await getMaxSystemIdNumber(prefix);
  return Array.from({ length: count }, (_, i) => formatSystemId(prefix, maxNumber + 1 + i));
}

export const generateGuardId  = (): Promise<string> => getNextSystemId('SSLG');
export const generateClientId = (): Promise<string> => getNextSystemId('SSLC');
export const generateStaffId  = (): Promise<string> => getNextSystemId('SSLS');

export const generateGuardIds = (count: number): Promise<string[]> => getNextSystemIds('SSLG', count);
