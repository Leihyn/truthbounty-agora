export const metadata = {
  title: 'TruthBounty Agora',
  description: 'Autonomous prediction-market copy-allocation agent on Arc.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#0a0a0f',
          color: '#e6e6f0',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {children}
      </body>
    </html>
  );
}
