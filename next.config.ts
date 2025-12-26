import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  
  async headers() {
    return [
      {
        source: '/checkout',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://sis-t.redsys.es:25443 https://sis.redsys.es",
              "frame-src 'self' https://sis-t.redsys.es:25443 https://sis.redsys.es",
              "connect-src 'self' https://sis-t.redsys.es:25443 https://sis.redsys.es https://*.vercel.app",
              "img-src 'self' data: https: http:",
              "style-src 'self' 'unsafe-inline'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

export default nextConfig;
