This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Kundevisningen (/kunde) og modellen bak chatten

`/kunde` er Sanna-visningen for Fjordlys Rådgivning AS. Chatten (Truls og
Sanna KI) spør `POST /api/ask`, som sender hele dummy-regnskapet til Claude.
Uten nøkkel svarer ruten 503 og siden bruker de innebygde svarene.

- Lokalt: legg `ANTHROPIC_API_KEY=...` i `.env.local` og kjør `npm run dev`.
- Hostet med server (Vercel e.l.): sett `ANTHROPIC_API_KEY` som miljøvariabel.
- GitHub Pages er statisk og har ingen server. Sett `NEXT_PUBLIC_BASE_PATH`
  som før og `NEXT_PUBLIC_ASK_URL=https://<din-vercel-app>/api/ask` ved bygging
  hvis chatten der skal gå via en hostet kopi.
