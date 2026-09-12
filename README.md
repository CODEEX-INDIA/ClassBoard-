# Maples Academy Smartboard Tool

Teach, present, annotate, and share lessons from any device.

Maples Academy Smartboard Tool is a Next.js classroom workspace for opening PDF documents, presenting them, writing or highlighting on pages, and exporting the result. The original file remains unchanged; annotations are stored as a versioned, page-relative layer.

## Features

- PDF viewing with page navigation and presentation layout
- Pen, highlighter, text notes, and basic shapes
- Undo and redo with deterministic annotation history
- Standard PDF export with annotations
- Mobile upload flow opened from a QR code
- Supabase-backed documents, exports, private storage, and row-level security
- Optional authenticated PPT/PPTX conversion service

## Requirements

- Node.js 20 or newer
- pnpm
- A Supabase project for saved documents and authentication

## Run locally

1. Install dependencies:

	```bash
	pnpm install
	```

2. Create `.env.local` in the project root:

	```env
	NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
	```

	The app can render its local UI without Supabase, but sign-in, saved documents, and remote sessions require these values.

3. Start the development server:

	```bash
	pnpm dev
	```

	Open [http://localhost:3000](http://localhost:3000).

## Useful commands

```bash
pnpm dev        # Start Next.js in development mode
pnpm typecheck  # Check TypeScript without emitting files
pnpm test       # Run the Vitest suite
pnpm build      # Create a production build
pnpm start      # Serve the production build
```

## App routes

| Route | Purpose |
| --- | --- |
| `/` | Open the classroom workspace |
| `/viewer` | View, present, annotate, and export a document |
| `/dashboard` | Browse saved documents |
| `/sign-in` | Sign in to the workspace |
| `/upload/:sessionId` | Upload from a paired mobile device |

## Supabase setup

Apply [`supabase/migrations/20260912000000_classboard.sql`](supabase/migrations/20260912000000_classboard.sql) using the Supabase CLI or SQL editor. The migration creates the document, annotation, export, upload-session, presentation-session, and realtime-event tables, enables row-level security, and creates private `documents`, `exports`, and `assets` buckets.

Use only the publishable key in browser-exposed variables. Never expose a Supabase service-role key in `.env.local`, client code, or deployment logs.

## PPT and PPTX support

PDF files are handled directly. PPT and PPTX files require a separate authenticated HTTPS conversion service:

```env
PRESENTATION_CONVERTER_URL=https://converter.example.com/convert
PRESENTATION_CONVERTER_TOKEN=your-server-only-token
```

The converter must preserve slide layout and return the converted document. Keep these values server-side; they are used by `app/api/import/route.ts`.

## Deployment

Deploy the Next.js app to Vercel or another Node.js host. Configure the same Supabase variables in the host environment, apply the Supabase migration before enabling saved documents, and run `pnpm build` as the build command. Configure the presentation converter separately when PPT/PPTX import is needed.

## Project notes

PDF.js is intentionally pinned to version 4.3.136. Review [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`LICENSE`](LICENSE) before distributing the application.
