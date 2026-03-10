import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VOICES, getVoiceGender } from "@/lib/voices";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { host_voice, guest_voice } = body;

  const validNames = VOICES.map((v) => v.name);
  if (!validNames.includes(host_voice) || !validNames.includes(guest_voice)) {
    return NextResponse.json({ error: "Invalid voice selection" }, { status: 400 });
  }

  if (host_voice === guest_voice) {
    return NextResponse.json({ error: "Host and Guest must have different voices" }, { status: 400 });
  }

  if (getVoiceGender(host_voice) === getVoiceGender(guest_voice)) {
    return NextResponse.json({ error: "Host and Guest must be different genders" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ host_voice, guest_voice })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update voices:", error.message);
    return NextResponse.json(
      { error: "Failed to save preference" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
