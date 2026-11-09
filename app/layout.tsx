import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouTube Channel Video Downloader — List & Download',
  description:
    'Kisi bhi YouTube channel ka link daalein, saari videos ki list dekhein, aur selected videos HD me download karein.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
