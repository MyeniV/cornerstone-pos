import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import mongoose from "mongoose";

const scrypt = promisify(scryptCallback);

export const employeeSchema = new mongoose.Schema({
  employeeNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
  displayName: { type: String, trim: true, maxlength: 80, default: "" },
  passwordHash: { type: String, required: true, select: false },
}, { versionKey: false });

export const employeeSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  employeeNo: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { versionKey: false });

export function normalizeEmployeeNo(employeeNo) {
  return typeof employeeNo === "string" ? employeeNo.trim().toUpperCase() : "";
}

export function isValidEmployeeNo(employeeNo) {
  return /^[A-Z0-9_-]{1,32}$/.test(employeeNo);
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Password must contain between 8 and 128 characters");
  }
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));

export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") return false;
  const [algorithm, saltValue, hashValue, extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue || extra !== undefined) return false;

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function shouldUseSecureCookie(request) {
  if (!request || typeof request !== "object") return false;
  const forwardedProto = request.headers?.["x-forwarded-proto"];
  const forwardedValues = (Array.isArray(forwardedProto) ? forwardedProto : [forwardedProto])
    .filter((value) => typeof value === "string")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase());
  if (forwardedValues.length > 0) {
    return forwardedValues.includes("https");
  }
  return Boolean(request.secure || request.protocol === "https");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
