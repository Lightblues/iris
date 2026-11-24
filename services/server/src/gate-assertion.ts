// Verifier for the gate's X-Gate-Assertion (baton packages/gate/verify/assertion.ts, baton-101).
// Copy this one file into an app; it needs only node:crypto (Node >= 18; TypeScript or strip the types).
//
// The gate (passkey gateway on tx04) adds `X-Gate-Assertion` to every request it lets through for a signed-in
// passkey: `<base64url(JSON {v:1, kid, host, owner, device, iat, exp})>.<base64url(Ed25519 signature)>`, valid ~60 s.
// Pin the gate's public key in the app's own env (the `x` field of https://<any gated host>/_gate/pubkey, or its
// PEM), accept the assertion only on the paths the app's web pages use, and keep scoped API keys for CLIs and
// agents. Rules and the full adoption checklist: baton skills/security-baseline/SKILL.md, "Gate assertion".
//
//   const who = verifyGateAssertion(req.headers['x-gate-assertion'], { publicKey: process.env.GATE_ASSERTION_PUBKEY!, host: 'etho.easonsi.site' });
//   if (who) { /* request is who.owner's, from passkey who.device */ }
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export type GateIdentity = { owner: string; device: string; iat: number; exp: number };
/** A key as the base64url raw Ed25519 public key (`x`), a PEM, a JWK, or a KeyObject. */
export type GateKey = string | KeyObject | { kty: string; crv: string; x: string };
export type VerifyOptions = {
  /** One key, or several during a rotation (old and new). */
  publicKey: GateKey | GateKey[];
  /** The app's public host, e.g. `etho.easonsi.site`; an assertion for another host is refused. */
  host: string;
  /** Milliseconds since the epoch (default Date.now()). */
  now?: number;
  /** Clock skew allowed in seconds (default 30). */
  skewSec?: number;
};

const keyCache = new Map<string, KeyObject>();
function toKey(k: GateKey): KeyObject {
  if (typeof k !== 'string' && !('kty' in k)) return k;
  const id = typeof k === 'string' ? k : JSON.stringify(k);
  let key = keyCache.get(id);
  if (!key) {
    const s = typeof k === 'string' ? k.trim() : '';
    key = typeof k !== 'string'
      ? createPublicKey({ key: { kty: k.kty, crv: k.crv, x: k.x }, format: 'jwk' })
      : s.startsWith('-----')
        ? createPublicKey(s)
        : createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: s.replace(/=+$/, '') }, format: 'jwk' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('gate assertion key is not Ed25519');
    keyCache.set(id, key);
  }
  return key;
}

/** The owner and device the gate signed for, or null when the header is missing, forged, expired or for another host. */
export function verifyGateAssertion(header: string | string[] | null | undefined, o: VerifyOptions): GateIdentity | null {
  if (Array.isArray(header)) return null; // two headers: someone added one
  if (typeof header !== 'string' || header.length > 4096) return null;
  const parts = header.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]+$/.test(parts[1]!)) return null;
  const [p, s] = parts as [string, string];
  const sig = Buffer.from(s, 'base64url');
  if (sig.length !== 64) return null;
  const keys = Array.isArray(o.publicKey) ? o.publicKey : [o.publicKey];
  const data = Buffer.from(p, 'ascii');
  if (!keys.some((k) => verify(null, data, toKey(k), sig))) return null;
  let a: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
    a = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  const skew = o.skewSec ?? 30;
  if (a.v !== 1) return null;
  if (typeof a.host !== 'string' || a.host !== o.host.toLowerCase()) return null;
  if (typeof a.owner !== 'string' || a.owner === '' || typeof a.device !== 'string') return null;
  if (typeof a.iat !== 'number' || typeof a.exp !== 'number' || !(a.exp > a.iat)) return null;
  if (a.iat > now + skew) return null;
  if (a.exp + skew <= now) return null;
  return { owner: a.owner, device: a.device, iat: a.iat, exp: a.exp };
}
