import { importSPKI, jwtVerify } from 'jose';
import { roleSchema } from '@ccis/contracts';
import type { Identity } from '@ccis/service-kit';

export type VerifiedIdentity = Identity & { exp: number };
export type TokenVerifier = (token: string) => Promise<VerifiedIdentity>;

export async function createTokenVerifier(publicKeyPem: string): Promise<TokenVerifier> {
  const key = await importSPKI(publicKeyPem, 'RS256');
  return async (token) => {
    const { payload } = await jwtVerify(token, key, { issuer: 'ccis-auth', algorithms: ['RS256'] });
    if (!payload.sub || !payload.exp) throw new Error('jeton incomplet');
    const identity: VerifiedIdentity = { userId: payload.sub, role: roleSchema.parse(payload.role), exp: payload.exp };
    if (typeof payload.email === 'string') identity.email = payload.email;
    return identity;
  };
}
