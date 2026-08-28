const SITE_URL = "https://truth-checker-app.vercel.app";

export default function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Truth Checker",
        alternateName: "Truth Checker AI",
        url: `${SITE_URL}/`,
        description:
          "Truth Checker investigates claims using available web evidence and AI analysis, then presents a clear verdict, reasoning, context, and sources.",
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#application`,
        name: "Truth Checker",
        url: `${SITE_URL}/`,
        description:
          "An AI-powered web evidence checker for investigating claims and comparing available sources.",
        applicationCategory: "ReferenceApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires a modern web browser with JavaScript enabled.",
        isAccessibleForFree: true,
        creator: {
          "@type": "Person",
          name: "Koglesh R. Murugan",
        },
        isPartOf: {
          "@id": `${SITE_URL}/#website`,
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData),
      }}
    />
  );
}
