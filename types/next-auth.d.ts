import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    googleAccessToken?: string;
    user: DefaultSession["user"] & { id: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleAccessToken?: string;
  }
}
