/** @type {import('next').NextConfig} */
const nextConfig = {
    /* config options here */
    experimental: {
        // Remotion usually plays nice, but sometimes needs this for webpack handling of fluent-ffmpeg source
    },
    webpack: (config) => {
        config.externals = [...(config.externals || []), 'fluent-ffmpeg', '@remotion/renderer', '@remotion/bundler', 'esbuild'];
        return config;
    }
};

export default nextConfig;
