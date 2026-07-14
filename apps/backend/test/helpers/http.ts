import type request from "supertest";

export function firstCookie(res: request.Response): string {
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("Expected a Set-Cookie header in the response");
  return raw.split(";")[0]!;
}
