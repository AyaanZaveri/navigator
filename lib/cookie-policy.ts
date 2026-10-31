/** Production desktop traffic stays on HTTP loopback; hosted sites use HTTPS. */
export function cookieRequiresHttps(): boolean {
    const desktopLoopback = process.env.NAVIGATOR_DESKTOP === "1"
    && process.env.HOSTNAME === "127.0.0.1";
    return process.env.NODE_ENV === "production" && !desktopLoopback;
}
