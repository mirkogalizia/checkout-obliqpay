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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://sis-t.redsys.es:25443 https://sis.redsys.es https://maps.googleapis.com https://v3.obliqpay.com",
              "frame-src 'self' https://sis-t.redsys.es:25443 https://sis.redsys.es https://v3.obliqpay.com",
              "connect-src 'self' https://sis-t.redsys.es:25443 https://sis.redsys.es https://*.vercel.app https://api.obliqpay.com https://v3.obliqpay.com https://maps.googleapis.com",
              "img-src 'self' data: https: http:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

export default nextConfig;

