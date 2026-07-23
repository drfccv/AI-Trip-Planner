import type { NextConfig } from "next";

const isPagesDemo = process.env.GITHUB_PAGES_DEMO === "true";
const pagesRepository =
  process.env.GITHUB_REPOSITORY?.split("/").pop() || "lvji-travel";
const pagesBasePath = `/${pagesRepository}`;

const nextConfig: NextConfig = {
  ...(isPagesDemo
    ? {
        output: "export",
        trailingSlash: true,
        basePath: pagesBasePath,
        assetPrefix: pagesBasePath,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
