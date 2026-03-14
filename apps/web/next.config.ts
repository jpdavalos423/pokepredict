import type { NextConfig } from 'next';

function normalizeProxyTarget(rawValue: string | undefined): string | null {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

const apiProxyTarget = normalizeProxyTarget(process.env.API_PROXY_TARGET);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`
      }
    ];
  }
};

export default nextConfig;
