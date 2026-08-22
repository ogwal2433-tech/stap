/**
 * What a bcrypt hash looks like: algorithm, cost factor, then 53 characters of
 * salt and digest — 60 in total.
 *
 * Worth checking explicitly because bcrypt.compare() answers `false` for a
 * malformed hash rather than throwing, so a corrupted column is
 * indistinguishable from a wrong password: the account refuses every password,
 * silently, with nothing in the logs.
 *
 * The way it gets corrupted is a password written into the database by hand. An
 * unquoted $2a$12$… inside a double-quoted shell string loses all three of its
 * $ segments to parameter expansion before psql ever sees it, and a 60-character
 * hash arrives as 54 with the algorithm and cost factor stripped off.
 */
export const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isValidBcryptHash(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && BCRYPT_HASH.test(hash);
}
