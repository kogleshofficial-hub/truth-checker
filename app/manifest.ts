import type { MetadataRoute } from "next";

const SITE_URL = "https://truth-checker-app.vercel.app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Truth Checker",
    short_name: "Truth Checker",
    description:
      "Investigate claims with web evidence and AI analysis.",
    start_url: SITE_URL,
    display: "standalone",
    background_color: "#050608",
    theme_color: "#050608",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
