import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const alt = "lobstr Analytics — On-Chain Protocol Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

let LOGO_SRC: string;
try {
  const logoData = readFileSync(join(process.cwd(), "public", "logo.png"));
  LOGO_SRC = `data:image/png;base64,${logoData.toString("base64")}`;
} catch {
  LOGO_SRC = "https://lobstr.gg/logo.png";
}

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#060A0F",
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700,
            height: 500,
            background:
              "radial-gradient(ellipse, rgba(88,176,89,0.12) 0%, rgba(88,176,89,0.04) 40%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            position: "relative",
            padding: "48px 80px",
          }}
        >
          {/* Logo + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_SRC}
              width={64}
              height={64}
              alt="lobstr"
              style={{
                borderRadius: 12,
                border: "2px solid rgba(88,176,89,0.15)",
              }}
            />
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                color: "#58B059",
                letterSpacing: "-2px",
                lineHeight: 1,
              }}
            >
              lobstr
            </div>
          </div>

          {/* Page title */}
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "#EAECEF",
              marginTop: 28,
              letterSpacing: "-0.5px",
            }}
          >
            On-Chain Analytics
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 17,
              color: "#5E6673",
              marginTop: 12,
              textAlign: "center",
              lineHeight: 1.6,
              maxWidth: 520,
            }}
          >
            Live protocol metrics, transaction heatmaps, and contract directory
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: 16, marginTop: 36 }}>
            {[
              { label: "Contracts", value: "19" },
              { label: "Network", value: "Base L2" },
              { label: "Data", value: "Live" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(88,176,89,0.06)",
                  border: "1px solid rgba(88,176,89,0.12)",
                  borderRadius: 100,
                  padding: "8px 20px",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: stat.value === "Live" ? "#58B059" : "#EAECEF",
                    letterSpacing: "0.5px",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: "rgba(88,176,89,0.3)",
                  }}
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "#5E6673",
                    textTransform: "uppercase",
                    letterSpacing: "1.5px",
                    fontWeight: 500,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background:
              "linear-gradient(90deg, transparent 5%, #58B059 50%, transparent 95%)",
          }}
        />

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            right: 40,
            fontSize: 14,
            color: "#5E6673",
            fontWeight: 500,
            letterSpacing: "0.5px",
          }}
        >
          lobstr.gg/analytics
        </div>
      </div>
    ),
    { ...size }
  );
}
