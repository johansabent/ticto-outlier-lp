import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'embed.yayforms.com' },
      { protocol: 'https', hostname: 'cdn.yayforms.com' },
    ],
  },
};

export default config;
