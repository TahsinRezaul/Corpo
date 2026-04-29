import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import { createSign } from "crypto";
import authConfig from "./auth.config";
import { findByEmail, verifyPassword, upsertOAuthUser } from "@/lib/users";

// Generate the Apple client-secret JWT using the private key from env.
// Apple requires an ES256-signed JWT; valid up to 6 months.
function generateAppleSecret(): string {
  const privateKey = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_KEY_ID })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 15_552_000,
    aud: "https://appleid.apple.com",
    sub: process.env.APPLE_ID,
  })).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const sign = createSign("SHA256");
  sign.update(signingInput);
  const signature = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${signingInput}.${signature}`;
}

const appleReady =
  process.env.APPLE_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY;

const providers = [
  Credentials({
    id: "email",
    name: "Email",
    credentials: {
      email:    { label: "Email",    type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email    = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;
      if (!email || !password) return null;
      const user = findByEmail(email);
      if (!user || !verifyPassword(user, password)) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),

  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })]
    : []),

  ...(appleReady
    ? [Apple({
        clientId: process.env.APPLE_ID!,
        clientSecret: generateAppleSecret(),
      })]
    : []),

  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
    ? [MicrosoftEntraId({
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? "common"}/v2.0`,
      })]
    : []),
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers,
  callbacks: {
    // When signing in via OAuth, find or create the local user by email so
    // that the same email works across Google, Apple, and email+password.
    async signIn({ user, account }) {
      if (account && (account.provider === "google" || account.provider === "apple" || account.provider === "microsoft-entra-id")) {
        if (!user.email) return false;
        try {
          const dbUser = upsertOAuthUser(user.email, user.name ?? user.email);
          user.id = dbUser.id;
        } catch {
          // Vercel has a read-only filesystem — writes fail but login should still succeed
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
