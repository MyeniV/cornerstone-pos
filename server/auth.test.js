import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, hashSessionToken, isValidEmployeeNo, normalizeEmployeeNo, shouldUseSecureCookie, verifyPassword } from "./auth.js";

test("normalizes and validates employee numbers", () => {
  assert.equal(normalizeEmployeeNo("  ab-012 "), "AB-012");
  assert.equal(isValidEmployeeNo("AB-012"), true);
  assert.equal(isValidEmployeeNo("not valid"), false);
});

test("verifies scrypt password hashes without accepting a different password", async () => {
  const storedHash = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", storedHash), true);
  assert.equal(await verifyPassword("incorrect password", storedHash), false);
  assert.equal(await verifyPassword("correct horse battery", "invalid"), false);
});

test("rejects passwords outside the supported length", async () => {
  await assert.rejects(hashPassword("short"), /8 and 128 characters/);
});

test("stores only a one-way digest of session tokens", () => {
  assert.match(hashSessionToken("session-token"), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSessionToken("session-token"), "session-token");
});

test("detects HTTPS proxies when deciding cookie security", () => {
  assert.equal(shouldUseSecureCookie({ headers: { "x-forwarded-proto": "https" } }), true);
  assert.equal(shouldUseSecureCookie({ headers: { "x-forwarded-proto": "http,https" } }), true);
  assert.equal(shouldUseSecureCookie({ headers: { "x-forwarded-proto": "http" } }), false);
  assert.equal(shouldUseSecureCookie({ secure: true }), true);
  assert.equal(shouldUseSecureCookie({ protocol: "https" }), true);
  assert.equal(shouldUseSecureCookie({}), false);
});
