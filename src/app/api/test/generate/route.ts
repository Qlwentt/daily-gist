import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEpisodeForUser } from "@/lib/generate-episode";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    await generateEpisodeForUser(user.id);
    return NextResponse.json({ message: "Episode generation complete" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
