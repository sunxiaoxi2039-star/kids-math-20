# CLAUDE.md

This file provides guidance for AI assistants (Claude and others) working in this repository.

## Project Overview

**Repository:** `kids-math-20`
**Purpose:** A kids math application (exact stack TBD — see below for recommended setup).
**Status:** Freshly initialized. Only a `.gitkeep` placeholder exists; no source code has been added yet.

## Repository State

As of the initial commit (`c1e6de5`), the repo contains only:

```
.gitkeep   # empty placeholder
```

All architecture, tooling, and conventions below are recommendations to follow when building out the project.

---

## Recommended Tech Stack

Since this is a kids math app, the following stack is suggested:

- **Framework:** React (with TypeScript) via Vite
- **Styling:** Tailwind CSS or CSS Modules
- **Testing:** Vitest + React Testing Library
- **Linting:** ESLint + Prettier
- **Package manager:** npm

If a different stack is chosen, update this file accordingly.

---

## Directory Structure (Recommended)

```
kids-math-20/
├── public/               # Static assets (icons, sounds, images)
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Top-level views/screens
│   ├── hooks/            # Custom React hooks
│   ├── utils/            # Pure helper functions (math logic, scoring, etc.)
│   ├── types/            # TypeScript type definitions
│   ├── assets/           # Images, fonts, audio
│   └── main.tsx          # App entry point
├── tests/                # Integration / e2e tests (if separate from src)
├── .github/workflows/    # CI/CD pipelines
├── .eslintrc.json
├── .prettierrc
├── tsconfig.json
├── vite.config.ts
├── package.json
└── CLAUDE.md
```

---

## Development Workflows

### Setup

```bash
npm install
```

### Dev server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Tests

```bash
npm test          # run all tests
npm run test:ui   # interactive test UI (Vitest)
```

### Lint & format

```bash
npm run lint      # ESLint
npm run format    # Prettier
```

---

## Key Conventions

### Code style

- **TypeScript** for all source files (`.ts` / `.tsx`).
- Prefer named exports over default exports for components.
- Component files: `PascalCase.tsx` (e.g., `AdditionQuiz.tsx`).
- Utility/hook files: `camelCase.ts` (e.g., `useScore.ts`).
- One component per file; co-locate its styles and tests.

### Math logic

- Keep all math generation logic (problem creation, answer checking, scoring) in `src/utils/`.
- Pure functions only — no side effects — so they are easy to unit test.
- Randomized problems should accept a seed parameter where possible to keep tests deterministic.

### Accessibility

- All interactive elements must have accessible labels (`aria-label` / `aria-describedby`).
- Adequate color contrast for young users.
- Support keyboard navigation.

### Testing

- Unit tests live alongside source files: `ComponentName.test.tsx`.
- Test filenames mirror the source filename they cover.
- Aim for full coverage of math utility functions.
- Use `describe` blocks to group related cases.

### Git

- Branch naming: `feature/<short-description>`, `fix/<short-description>`, `claude/<task-id>`.
- Commits: imperative mood, concise subject (`Add multiplication quiz component`).
- Do not commit build artifacts or generated files.
- PR descriptions should include a summary of changes and how to test them.

---

## CI/CD

No CI is configured yet. When added, GitHub Actions workflows should live in `.github/workflows/` and run:

1. `npm run lint`
2. `npm test`
3. `npm run build`

on every push and pull request.

---

## Environment Variables

No environment variables are required for the base app. If external services (e.g., analytics, auth) are added later, document them here with an `.env.example` file at the repo root.

---

## AI Assistant Notes

- This is a **children's educational app** — keep language, visuals, and interactions age-appropriate and encouraging.
- Prioritize simplicity and readability over cleverness.
- When adding new features, always add corresponding unit tests.
- Do not introduce unnecessary dependencies; keep the bundle size small.
- Before creating new files, check whether an existing utility or component already covers the need.
- Update this `CLAUDE.md` whenever the tech stack, directory structure, or key conventions change.
