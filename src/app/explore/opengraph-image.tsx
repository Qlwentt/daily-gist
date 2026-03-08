import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Explore Daily Gist — Browse sample podcast episodes";

export default function OpenGraphImage() {
  const categories = ["AI & Tech", "Finance", "Health & Science", "Productivity"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a0e2e",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background gradient orbs */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            right: "-10%",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(157, 124, 216, 0.2) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            left: "-10%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(232, 164, 74, 0.12) 0%, transparent 70%)",
          }}
        />

        {/* Logo icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "72px",
            height: "72px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
            fontSize: "32px",
            fontWeight: 800,
            color: "#ffffff",
            marginBottom: "28px",
          }}
        >
          DG
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontSize: "56px",
              fontWeight: 400,
              color: "#faf7f2",
              letterSpacing: "-2px",
              lineHeight: 1.1,
            }}
          >
            Explore Daily Gist
          </div>
          <div
            style={{
              fontSize: "24px",
              color: "rgba(250, 247, 242, 0.55)",
              letterSpacing: "-0.5px",
            }}
          >
            Browse sample episodes and hear what it sounds like
          </div>
        </div>

        {/* Category pills */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "36px",
          }}
        >
          {categories.map((cat) => (
            <div
              key={cat}
              style={{
                padding: "8px 20px",
                borderRadius: "20px",
                fontSize: "18px",
                fontWeight: 500,
                color: "rgba(250, 247, 242, 0.8)",
                background: "rgba(250, 247, 242, 0.08)",
                border: "1px solid rgba(250, 247, 242, 0.12)",
              }}
            >
              {cat}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
