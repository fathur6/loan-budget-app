/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Penting untuk Capacitor
  images: { 
    unoptimized: true // Penting untuk elak isu imej
  },
};

export default nextConfig;