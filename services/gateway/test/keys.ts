import { exportSPKI, generateKeyPair, SignJWT } from 'jose';

export async function testKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicPem = await exportSPKI(publicKey);
  const sign = (sub: string, role: string, expiresIn = '1h', issuer = 'ccis-auth') =>
    new SignJWT({ role }).setProtectedHeader({ alg: 'RS256' }).setSubject(sub).setIssuer(issuer).setIssuedAt().setExpirationTime(expiresIn).sign(privateKey);
  return { publicPem, sign };
}
