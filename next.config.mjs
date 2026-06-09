import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [],
  },
  env: {
    NEXT_PUBLIC_BUGSINK_DSN: process.env.BUGSINK_DSN ?? "",
  },
};

const sentryBuildOptions = {
  silent: true,
  disableLogger: true,
};

export default process.env.BUGSINK_DSN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
