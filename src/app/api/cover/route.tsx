import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "Collection";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1400,
          height: 1400,
          display: "flex",
          position: "relative",
        }}
      >
        {/* Base cover art */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${appUrl}/podcast-cover.png`}
          alt=""
          width={1400}
          height={1400}
          style={{ position: "absolute", top: 0, left: 0 }}
        />

        {/* Collection name badge — bottom right */}
        <div
          style={{
            position: "absolute",
            bottom: 80,
            right: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 36px",
            borderRadius: 20,
            background: "rgba(107, 76, 154, 0.85)",
            transform: "rotate(-6deg)",
            maxWidth: 600,
          }}
        >
          <span
            style={{
              color: "#ffffff",
              fontSize: 56,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              lineHeight: 1.2,
              textAlign: "center",
            }}
          >
            {name}
          </span>
        </div>
      </div>
    ),
    {
      width: 1400,
      height: 1400,
      headers: {
        "Cache-Control": "public, max-age=604800, immutable",
      },
    }
  );
}
