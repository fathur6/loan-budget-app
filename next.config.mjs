/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hanya gunakan export jika kita membina untuk mobile (Capacitor)
  output: process.env.IS_CAPACITOR ? 'export' : undefined,
  images: { 
    unoptimized: true 
  },
};

export default nextConfig;