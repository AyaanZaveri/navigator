/** A separate, static Next.js app: no server actions or production app imports. */
export default {
    output: 'export',
    assetPrefix: '/assets/web',
    images: { unoptimized: true },
    poweredByHeader: false,
};
