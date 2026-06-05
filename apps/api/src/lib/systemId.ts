import prisma from '../db/prisma';

export type IdPrefix = 'SSLG' | 'SSLC' | 'SSLS';

export function formatSystemId(prefix: IdPrefix, number: number): string {
  return `${prefix}${number.toString().padStart(3, '0')}`;
}

async function getNextSystemId(prefix: IdPrefix): Promise<string> {
  let maxNumber = 0;

  if (prefix === 'SSLG') {
    const result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(
        CAST(REGEXP_REPLACE("systemId", '[^0-9]', '', 'g') AS INTEGER)
      ) AS max_num
      FROM "Guard"
      WHERE "systemId" LIKE 'SSLG%'
        AND "systemId" ~ '^SSLG[0-9]+$'
    `;
    maxNumber = result[0]?.max_num ?? 0;
  } else if (prefix === 'SSLC') {
    const result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(
        CAST(REGEXP_REPLACE("systemId", '[^0-9]', '', 'g') AS INTEGER)
      ) AS max_num
      FROM "Client"
      WHERE "systemId" LIKE 'SSLC%'
        AND "systemId" ~ '^SSLC[0-9]+$'
    `;
    maxNumber = result[0]?.max_num ?? 0;
  } else {
    const result = await prisma.$queryRaw<{ max_num: number | null }[]>`
      SELECT MAX(
        CAST(REGEXP_REPLACE("systemId", '[^0-9]', '', 'g') AS INTEGER)
      ) AS max_num
      FROM "User"
      WHERE "systemId" LIKE 'SSLS%'
        AND "systemId" ~ '^SSLS[0-9]+$'
    `;
    maxNumber = result[0]?.max_num ?? 0;
  }

  return formatSystemId(prefix, (maxNumber ?? 0) + 1);
}

export const generateGuardId  = (): Promise<string> => getNextSystemId('SSLG');
export const generateClientId = (): Promise<string> => getNextSystemId('SSLC');
export const generateStaffId  = (): Promise<string> => getNextSystemId('SSLS');
