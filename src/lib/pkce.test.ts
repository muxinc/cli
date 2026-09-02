import { describe, expect, it } from 'bun:test';
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce.ts';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe('generateCodeVerifier', () => {
  it('produces unpadded base64url within the RFC 7636 length bounds', () => {
    const verifier = generateCodeVerifier();

    expect(verifier).toMatch(BASE64URL);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('produces a distinct value on every call', () => {
    const verifiers = new Set(
      Array.from({ length: 50 }, () => generateCodeVerifier()),
    );

    expect(verifiers.size).toBe(50);
  });
});

describe('computeCodeChallenge', () => {
  // RFC 7636 Appendix B test vector.
  it('matches the RFC 7636 S256 test vector', () => {
    expect(
      computeCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('produces unpadded base64url', () => {
    const challenge = computeCodeChallenge(generateCodeVerifier());

    expect(challenge).toMatch(BASE64URL);
    expect(challenge).not.toContain('=');
  });

  it('is deterministic for a given verifier', () => {
    const verifier = generateCodeVerifier();

    expect(computeCodeChallenge(verifier)).toBe(computeCodeChallenge(verifier));
  });

  it('differs for different verifiers', () => {
    expect(computeCodeChallenge('verifier-one')).not.toBe(
      computeCodeChallenge('verifier-two'),
    );
  });
});

describe('generateState', () => {
  it('produces unpadded base64url of at least 32 bytes of entropy', () => {
    const state = generateState();

    expect(state).toMatch(BASE64URL);
    expect(state.length).toBeGreaterThanOrEqual(43);
  });

  it('produces a distinct value on every call', () => {
    const states = new Set(Array.from({ length: 50 }, () => generateState()));

    expect(states.size).toBe(50);
  });
});
