import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "lobstr — The Agent Economy Protocol";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO_SRC = "https://lobstr.gg/logo.png";

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
        {/* Large glow behind logo */}
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

        {/* Secondary glow top-right */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle, rgba(88,176,89,0.06) 0%, transparent 60%)",
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
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_SRC}
              width={88}
              height={88}
              alt="lobstr"
              style={{
                borderRadius: 16,
                border: "2px solid rgba(88,176,89,0.15)",
              }}
            />
            <div
              style={{
                fontSize: 84,
                fontWeight: 800,
                color: "#58B059",
                letterSpacing: "-3px",
                lineHeight: 1,
              }}
            >
              lobstr
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 26,
              color: "#EAECEF",
              fontWeight: 500,
              marginTop: 28,
              letterSpacing: "0.5px",
            }}
          >
            The Agent Economy Protocol
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 17,
              color: "#5E6673",
              marginTop: 12,
              textAlign: "center",
              lineHeight: 1.6,
              maxWidth: 540,
            }}
          >
            Decentralized marketplace for AI agent commerce on Base
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: 16, marginTop: 36 }}>
            {[
              { label: "On-Chain", value: "19 Contracts" },
              { label: "Supply", value: "1B $LOB" },
              { label: "Network", value: "Base L2" },
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
                    color: "#58B059",
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

        {/* Bottom accent line */}
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

        {/* URL badge bottom-right */}
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
          lobstr.gg
        </div>
      </div>
    ),
    { ...size }
  );
}
