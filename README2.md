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
2. Run the migrations in `supabase/migrations/` in order, starting with `0001_initial.sql`. Theme names need `0006_theme_titles.sql`; saving them fails with a message if that table is missing. Mock exams need `0008_mock_exams.sql` (until it is run the admin can't save them and students simply see no mock exams), and `0009_mock_exam_questions.sql` to let a mock exam have its own questions. `0011_level5_and_theme_notes.sql` adds the Level 5 subject (Econometrics) and the per-theme "Notes From Lecture" links; `0012_management_accounting.sql` adds the Level 5 subject Management Accounting (MA). Run `0010_restore_strict_is_admin.sql` too: it makes sure only real admins (the listed admin email, or an account with `app_metadata.role = 'admin'`) can write to the database.
3. Enable Anonymous Sign-Ins in Supabase Auth so public quiz sessions can store results under an auth user id.
4. Create your admin email/password accounts in Supabase Auth.
5. Keep public sign-ups disabled.
6. To make someone else an admin, run once in the SQL editor (they then sign in again):
   `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb where lower(email) = lower('their-email@example.com');`

### Data model

- `questions` stores the quiz content, answer options, and explanations.
- `results` stores quiz attempts for the signed-in user id.
- `theme_titles` stores the custom theme names set in the admin panel.
- `theme_notes` stores the optional https "Notes From Lecture" (Notion) link shown under each theme.
- `mock_exams` stores the mock exams that sit between themes (title, position, optional source themes, question count). A mock exam always includes its own questions (`questions.mock_exam_id`) and fills any remaining slots evenly from its source themes, so no questions are duplicated.
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

- Each quiz step (subjects, themes, quiz) is its own browser-history entry, so Back moves one step at a time. Leaving a running quiz with Back asks for confirmation.
- Smooth scrolling uses [Lenis](https://github.com/darkroomengineering/lenis); it is switched off for visitors who prefer reduced motion, and inner scroll areas (modals, text boxes, anything with `data-lenis-prevent`) keep normal scrolling.
- The home page has an animated background of small characters (all printable ASCII: digits, letters and punctuation, shaded by how much ink each one uses) that sways like ocean swells and ripples away from the mouse (`src/oceanBackground.ts`, maths in `src/oceanSim.ts`). It only runs on the home page and sleeps when nothing is moving. On touch screens it runs a lighter version (fewer, slightly larger characters, a slower sway) that ripples under a finger; with "reduce motion" it is a single still frame with no animation loop. The page is not shown in the quiz or admin views, and the loop stops when you leave the home page.
- The page is framed by a scroll-ornament border at the very top and a mirrored one at the very bottom (`src/assets/ornament-band.svg`, used as a CSS mask in `src/styles.css`); they scroll away with the page and are hidden during a full-screen quiz.
- The site uses the self-hosted Plus Jakarta Sans variable font (`@fontsource-variable/plus-jakarta-sans`), so no request goes to Google Fonts.
- The public quiz flow uses sessionStorage to cache question pools for the current browser session.
- The admin bundle is lazy-loaded and only fetched when `/admin` is visited directly.
- Images are kept to a single optimized SVG logo to minimize payload and avoid layout shift.
