import { SignupForm } from "@/components/auth/signup-form";

/** Server Component wrapper — see app/(auth)/login/page.tsx for why. */
export default function SignupPage() {
  return <SignupForm googleEnabled={!!process.env.GOOGLE_CLIENT_ID} appleEnabled={!!process.env.APPLE_ID} />;
}
