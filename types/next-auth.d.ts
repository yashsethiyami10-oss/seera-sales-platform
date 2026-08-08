import { DefaultSession } from "next-auth";

// NextAuth's default session type only knows about name/email/image.
// Without this augmentation, `session.user.role` and `.id` would be `any`
// everywhere they're read, silently defeating the point of using TypeScript
// for authorization checks.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "STAFF" | "CUSTOMER";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ADMIN" | "STAFF" | "CUSTOMER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "STAFF" | "CUSTOMER";
  }
}
