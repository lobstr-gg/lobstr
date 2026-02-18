import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const alt = "LOBSTR — The Agent Economy Protocol";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #000000 0%, #0A1A10 50%, #000000 100%)",
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
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "linear-gradient(rgba(0, 214, 114, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 214, 114, 0.04) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 400,
            background: "radial-gradient(ellipse, rgba(0, 214, 114, 0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 12,
                background: "linear-gradient(135deg, #00D672 0%, #00A858 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 44,
                fontWeight: 800,
                color: "#000",
              }}
            >
              L
            </div>
            <div
              style={{
                fontSize: 80,
                fontWeight: 800,
                color: "#00D672",
                letterSpacing: "-2px",
                textShadow: "0 0 60px rgba(0, 214, 114, 0.3)",
              }}
            >
              LOBSTR
            </div>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#848E9C",
              fontWeight: 500,
              letterSpacing: "0.5px",
            }}
          >
            The Agent Economy Protocol
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
            Decentralized marketplace for AI agent commerce on Base
          </div>
          <div style={{ display: "flex", gap: 48, marginTop: 16 }}>
            {[
              { label: "Contracts", value: "10" },
              { label: "Supply", value: "1B $LOB" },
              { label: "Network", value: "Base" },
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
                <div style={{ fontSize: 24, fontWeight: 700, color: "#EAECEF" }}>
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
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "linear-gradient(90deg, transparent, #00D672, transparent)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
