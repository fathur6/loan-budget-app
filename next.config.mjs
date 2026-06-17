// NEXT.CONFIG.MJS
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Ini penting untuk Capacitor
  images: { unoptimized: true }, // Penting untuk elak isu imej
};

export default nextConfig;