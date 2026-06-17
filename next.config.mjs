/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gunakan 'output: export' HANYA jika variable ada, jika tidak, biarkan Vercel urus
  output: process.env.NEXT_PUBLIC_IS_CAPACITOR === 'true' ? 'export' : undefined,
  images: { unoptimized: true },
};
export default nextConfig;