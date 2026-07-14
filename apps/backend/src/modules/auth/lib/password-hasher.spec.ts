import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password-hasher";

// docs/AUTHENTICATION.md §5: argon2id, never bcrypt/sha256-only.
describe("password-hasher", () => {
  it("hashes with an argon2id-tagged hash and verifies the same password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);

    await expect(verifyPassword({ hash, password: "correct horse battery staple" })).resolves.toBe(true);
  });

  it("rejects an incorrect password against a real hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword({ hash, password: "wrong password" })).resolves.toBe(false);
  });
});
