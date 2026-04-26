/**
 * Unit tests for utils/security/app-license.ts
 *
 * Tests the core license validation, parsing, and state logic
 * without requiring native modules or real crypto keys.
 */

// Mock secure-storage
jest.mock("../utils/security/secure-storage", () => ({
  secureGet: jest.fn().mockResolvedValue(null),
  secureSet: jest.fn().mockResolvedValue(undefined),
  secureDelete: jest.fn().mockResolvedValue(undefined),
}));

// Mock device
jest.mock("../utils/security/device", () => ({
  getDeviceId: jest.fn().mockResolvedValue("test-device-id-123"),
}));

// Mock crypto utilities (not testing crypto primitives here)
jest.mock("../utils/security/crypto", () => ({
  ed25519Verify: jest.fn().mockReturnValue(true),
  fromBase64: jest.fn((s: string) => new Uint8Array(Buffer.from(s, "base64"))),
  fromHex: jest.fn((s: string) => new Uint8Array(Buffer.from(s, "hex"))),
  fromUtf8: jest.fn((b: Uint8Array) => Buffer.from(b).toString("utf8")),
  toBase64: jest.fn((b: Uint8Array) => Buffer.from(b).toString("base64")),
  utf8: jest.fn((s: string) => new Uint8Array(Buffer.from(s, "utf8"))),
}));

jest.mock("../utils/security/master-public-key", () => ({
  APP_ID: "com.example.learnpath",
  APP_MASTER_PUBLIC_KEY_HEX: "deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb",
}));

import {
  isAppActivated,
  getLicenseDetails,
} from "../utils/security/app-license";

import { secureGet, secureSet } from "../utils/security/secure-storage";

// ─── isAppActivated ───────────────────────────────────────────────────────────

describe("isAppActivated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns false when no license stored", async () => {
    (secureGet as jest.Mock).mockResolvedValue(null);
    const result = await isAppActivated();
    expect(result).toBe(false);
  });

  test("returns false when stored value is empty string", async () => {
    (secureGet as jest.Mock).mockResolvedValue("");
    const result = await isAppActivated();
    expect(result).toBe(false);
  });

  test("returns false when stored JSON is malformed", async () => {
    (secureGet as jest.Mock).mockResolvedValue("not-valid-json");
    const result = await isAppActivated();
    expect(result).toBe(false);
  });

  test("returns false when secureGet throws", async () => {
    (secureGet as jest.Mock).mockRejectedValue(new Error("Secure store error"));
    const result = await isAppActivated();
    expect(result).toBe(false);
  });
});

// ─── getLicenseDetails ────────────────────────────────────────────────────────

describe("getLicenseDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns null when no license stored", async () => {
    (secureGet as jest.Mock).mockResolvedValue(null);
    const result = await getLicenseDetails();
    expect(result).toBeNull();
  });

  test("returns null when storage throws", async () => {
    (secureGet as jest.Mock).mockRejectedValue(new Error("Storage error"));
    const result = await getLicenseDetails();
    expect(result).toBeNull();
  });
});

// ─── getLicenseDetails (status wrapper) ──────────────────────────────────────

describe("getLicenseDetails as status check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns null when no license", async () => {
    (secureGet as jest.Mock).mockResolvedValue(null);
    const status = await getLicenseDetails();
    // Should be null when nothing stored
    expect(status).toBeNull();
  });

  test("does not throw under any circumstances", async () => {
    (secureGet as jest.Mock).mockRejectedValue(new Error("fail"));
    await expect(getLicenseDetails()).resolves.not.toThrow();
  });
});
