import { describe, expect, it } from "vitest";
import {
  decryptString,
  encryptString,
  ENVELOPE_VERSION,
  isEncryptedEnvelope,
} from "./crypto";

describe("encryptString / decryptString", () => {
  it("round-trips plaintext through the envelope", async () => {
    const envelope = await encryptString('{"hello":"world"}', "secret-passphrase");
    const restored = await decryptString(envelope, "secret-passphrase");
    expect(restored).toBe('{"hello":"world"}');
  });

  it("uses a versioned envelope with base64 fields", async () => {
    const envelope = await encryptString("payload", "secret-passphrase");
    expect(envelope).toMatchObject({ v: ENVELOPE_VERSION });
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    expect(envelope.salt).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(envelope.iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(envelope.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("rejects the wrong passphrase", async () => {
    const envelope = await encryptString("payload", "correct");
    await expect(decryptString(envelope, "wrong")).rejects.toThrow(
      /wrong passphrase|Decryption failed/i,
    );
  });

  it("produces different ciphertext for the same plaintext", async () => {
    const first = await encryptString("payload", "secret-passphrase");
    const second = await encryptString("payload", "secret-passphrase");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
  });
});

describe("isEncryptedEnvelope", () => {
  it("returns false for plain backup payloads", () => {
    expect(
      isEncryptedEnvelope({
        v: 1,
        profileId: "local",
        entries: [],
        packs: [],
        skins: [],
        settings: null,
      }),
    ).toBe(false);
  });
});
