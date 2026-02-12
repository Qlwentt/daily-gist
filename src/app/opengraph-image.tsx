import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Daily Gist — Your newsletters, as a daily podcast";

export default function OpenGraphImage() {
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
            width: "80px",
            height: "80px",
            borderRadius: "20px",
            background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
            fontSize: "36px",
            fontWeight: 800,
            color: "#ffffff",
            marginBottom: "32px",
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
              fontSize: "64px",
              fontWeight: 400,
              color: "#faf7f2",
              letterSpacing: "-2px",
              lineHeight: 1.1,
            }}
          >
            Daily Gist
          </div>
          <div
            style={{
              fontSize: "28px",
              color: "rgba(250, 247, 242, 0.55)",
              letterSpacing: "-0.5px",
            }}
          >
            Your newsletters, as a daily podcast
          </div>
        </div>

        {/* Waveform decoration */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "40px",
            height: "40px",
          }}
        >
          {Array.from({ length: 30 }, (_, i) => {
            const h = 10 + ((i * 37 + 13) % 30);
            return (
              <div
                key={i}
                style={{
                  width: "4px",
                  height: `${h}px`,
                  borderRadius: "2px",
                  background:
                    i < 12
                      ? "#9d7cd8"
                      : "rgba(157, 124, 216, 0.3)",
                }}
              />
            );
          })}
        </div>
      </div>
    ),
    { ...size }
  );
}
