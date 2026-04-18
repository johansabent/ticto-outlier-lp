import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Inter } from 'next/font/google';
import './globals.css';

const tomatoGrotesk = localFont({
  src: [
    { path: './fonts/TomatoGrotesk-Regular.otf',  weight: '400', style: 'normal' },
    { path: './fonts/TomatoGrotesk-Bold.otf',     weight: '700', style: 'normal' },
    { path: './fonts/TomatoGrotesk-Black.otf',    weight: '900', style: 'normal' },
  ],
  variable: '--font-tomato',
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: [
    { path: './fonts/SpaceGrotesk-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/SpaceGrotesk-Medium.ttf',  weight: '500', style: 'normal' },
    { path: './fonts/SpaceGrotesk-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/SpaceGrotesk-Bold.ttf',    weight: '700', style: 'normal' },
  ],
  variable: '--font-space',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Ebulição × Ticto',
  description: 'Cadastre-se e concorra a um iPhone 16 Pro. Evento Rafa Prado × Ticto.',
  openGraph: {
    title: 'Ebulição × Ticto',
    description: 'Cadastre-se e concorra a um iPhone 16 Pro. Evento Rafa Prado × Ticto.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${tomatoGrotesk.variable} ${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-brand-cyan focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Ir para o conteúdo principal
        </a>
        {children}
      </body>
    </html>
  );
}
