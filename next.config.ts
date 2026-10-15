import type { NextConfig } from "next";

// GitHub Pages build (see .github/workflows/deploy-pages.yml): a static
// export served under /<repo>/. Local dev and any server host keep the full
// app, including the /api/notify email route.
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport && {
    output: "export",
    basePath: process.env.NEXT_PUBLIC_BASE_PATH,
    // GitHub Pages serves /clients/x/ as /clients/x/index.html.
    trailingSlash: true,
  }),
};

export default nextConfig;
