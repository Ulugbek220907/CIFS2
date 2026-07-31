# Pulse Quiz

A fast, lightweight quiz site built with Vite, vanilla TypeScript, plain CSS, and Supabase.

## What is included

- Public home page and `/quiz` flow with subject selection, difficulty selection, timed questions, immediate feedback, and results history.
- Hidden `/admin` route with Supabase email/password login and full question CRUD.
- Supabase migration for `questions` and `results` tables plus RLS policies.
- Dynamic import boundary so the admin UI stays out of the public bundle.

## Environment variables

Create a local `.env` file based on `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Supabase setup

1. Create a new Supabase project.
2. Run the migration in `supabase/migrations/0001_initial.sql`.
3. Enable Anonymous Sign-Ins in Supabase Auth so public quiz sessions can store results under an auth user id.
4. Create your admin email/password accounts in Supabase Auth.
5. Keep public sign-ups disabled.

### Data model

- `questions` stores the quiz content, answer options, and explanations.
- `results` stores quiz attempts for the signed-in user id.
- RLS allows public reads on `questions`, anonymous/authenticated inserts on `results` only for the current user, and non-anonymous authenticated writes on `questions`.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The production output is the static `dist/` folder. Deploy that folder to Vercel, Netlify, or Cloudflare Pages and point the app at your Supabase project using the environment variables above.

## Notes

- The public quiz flow uses sessionStorage to cache question pools for the current browser session.
- The admin bundle is lazy-loaded and only fetched when `/admin` is visited directly.
- Images are kept to a single optimized SVG logo to minimize payload and avoid layout shift.
