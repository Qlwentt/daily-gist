import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side OTP verification.
 *
 * Supabase GoTrue stores OTP hashes as SHA-224(email + otp) in the
 * recovery_token column. The POST /auth/v1/verify endpoint's `token`
 * parameter should re-hash and compare, but `token_hash` (direct
 * comparison) is more reliable. Since Web Crypto doesn't support
 * SHA-224, we compute the hash server-side.
 */
export async function POST(request: NextRequest) {
  const { email, code } = await request.json();

  if (!email || !code) {
    return NextResponse.json(
      { error: "email and code are required" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // GoTrue's GenerateTokenHash: hex(SHA-224(email + otp))
  const tokenHash = createHash("sha224")
    .update(email + code)
    .digest("hex");

  // Try magiclink type (existing user sign-in), then signup (new user)
  for (const type of ["magiclink", "signup"]) {
    const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });

    const body = await res.json();

    if (res.ok && body.access_token) {
      return NextResponse.json({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
    }
  }

  return NextResponse.json(
    { error: "Token has expired or is invalid" },
    { status: 403 }
  );
}
