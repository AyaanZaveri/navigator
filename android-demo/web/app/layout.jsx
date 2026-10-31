import './style.css';

export const metadata = { title: 'Navigator Playback Demo' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Layout({ children }) {
    return <html lang="en"><body>{children}</body></html>;
}
