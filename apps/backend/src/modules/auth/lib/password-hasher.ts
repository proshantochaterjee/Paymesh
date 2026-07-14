import * as argon2 from "argon2";

/**
 * Better Auth's own default password hasher is scrypt, not argon2id —
 * overridden here to match docs/AUTHENTICATION.md §5's explicit choice
 * (argon2id, "never bcrypt/sha256-only").
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  return argon2.verify(data.hash, data.password);
}
