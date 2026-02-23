import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const alt = "LOBSTR Analytics — On-Chain Protocol Intelligence";
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
          background:
            "linear-gradient(135deg, #000000 0%, #0A1A10 50%, #000000 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Radial glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 400,
            background:
              "radial-gradient(ellipse, rgba(88, 176, 89, 0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            position: "relative",
          }}
        >
          {/* Logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_SRC}
              width={72}
              height={72}
              alt="LOBSTR"
              style={{ borderRadius: 10 }}
            />
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: "#58B059",
                letterSpacing: "-1.5px",
                textShadow: "0 0 60px rgba(88, 176, 89, 0.3)",
              }}
            >
              LOBSTR
            </div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#EAECEF",
              letterSpacing: "0.5px",
            }}
          >
            On-Chain Analytics
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#5E6673",
              maxWidth: 600,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Live protocol metrics, airdrop tracking, and contract directory
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 56, marginTop: 12 }}>
            {[
              { label: "Contracts", value: "10" },
              { label: "Network", value: "Base" },
              { label: "Data", value: "Live" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: stat.value === "Live" ? "#58B059" : "#EAECEF",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#5E6673",
                    textTransform: "uppercase",
                    letterSpacing: "2px",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background:
              "linear-gradient(90deg, transparent, #58B059, transparent)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
