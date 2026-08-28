import { ImageResponse } from "next/og";

export const alt = "Truth Checker — Evidence Before Certainty";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 84px",
          background: "#050608",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            marginBottom: "42px",
          }}
        >
          <div
            style={{
              width: "58px",
              height: "58px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              background: "white",
              color: "black",
              fontSize: "30px",
              fontWeight: 900,
            }}
          >
            T
          </div>
          <div style={{ fontSize: "30px", fontWeight: 700 }}>
            Truth Checker
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "70px",
            lineHeight: 1.02,
            fontWeight: 900,
            letterSpacing: "-3px",
          }}
        >
          <span>Don&apos;t just believe it.</span>
          <span style={{ color: "#a1a1aa" }}>Check it.</span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "34px",
            fontSize: "25px",
            lineHeight: 1.4,
            color: "#a1a1aa",
            maxWidth: "900px",
          }}
        >
          Investigate claims with web evidence and AI analysis.
        </div>
      </div>
    ),
    size
  );
}
