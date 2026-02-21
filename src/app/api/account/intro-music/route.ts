import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_TRACKS = [
  "Daily_Gist_Country_1.mp3",
  "Daily_Gist_Country_2.mp3",
  "Daily_Gist_Gospel_1.mp3",
  "Daily_Gist_Gospel_2.mp3",
  "Daily_Gist_Hip_Hop_Female.mp3",
  "Daily_Gist_Hip_Hop_Male.mp3",
  "Daily_Gist_Jazz.mp3",
  "Daily_Gist_K-Pop.mp3",
  "Daily_Gist_Latin.mp3",
  "Daily_Gist_Metal_1.mp3",
  "Daily_Gist_Metal_2.mp3",
  "Daily_Gist_Newsroom_1.mp3",
  "Daily_Gist_Newsroom_2.mp3",
  "Daily_Gist_Pop_Female.mp3",
  "Daily_Gist_Pop_Male_1.mp3",
  "Daily_Gist_Pop_Male_2.mp3",
  "Daily_Gist_Raggae.mp3",
  "Daily_Gist_RnB_Female.mp3",
  "Daily_Gist_RnB_Male.mp3",
  "Daily_Gist_Rock.mp3",
  "Daily_Gist_Trap_Rap.mp3",
];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { track } = body;

  // Validate: must be null or a known filename
  if (track !== null && !VALID_TRACKS.includes(track)) {
    return NextResponse.json({ error: "Invalid track" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ intro_music: track })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update intro music:", error.message);
    return NextResponse.json(
      { error: "Failed to save preference" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
