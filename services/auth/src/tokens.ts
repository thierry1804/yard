import { importPKCS8, SignJWT } from 'jose';
import type { Role } from '@ccis/contracts';

export const TOKEN_ISSUER = 'ccis-auth';

export interface TokenSigner {
  sign(user: { id: string; role: Role }): Promise<string>;
}

export async function createTokenSigner(privateKeyPem: string): Promise<TokenSigner> {
  const key = await importPKCS8(privateKeyPem, 'RS256');
  return {
    sign: (user) =>
      new SignJWT({ role: user.role })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject(user.id)
        .setIssuer(TOKEN_ISSUER)
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(key),
  };
}
