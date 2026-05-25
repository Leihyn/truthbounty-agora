import './globals.css';

export const metadata = {
  title: 'TruthBounty Agora — autonomous prediction-market agent on Arc',
  description: 'An autonomous agent that copies the provably-best prediction-market traders, settling a USDC book on Arc via Circle.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
