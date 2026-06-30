import React from 'react';

export const metadata = {
  title: 'KRB Security Dashboard',
  description: 'Advanced Management Panel for KRB Infrastructure',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-black text-white antialiased m-0 p-0">
        {children}
      </body>
    </html>
  );
}
