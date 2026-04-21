import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { findByEmail, verifyPassword } from "@/lib/users";

const providers = [
  // Email + password
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

  // Guest (no account)
  Credentials({
    id: "guest",
    name: "Guest",
    credentials: {},
    async authorize() {
      return { id: "guest", name: "Guest", email: "guest@corpo.local" };
    },
  }),
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers,
  callbacks: {
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
