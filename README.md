# mLab Assessment Centre

mLab Assessment Centre is a role-based assessment and compliance platform for accredited training delivery. It manages the journey from learner onboarding and cohort setup through assessment authoring, evidence submission, facilitation, assessor marking, moderation, workplace sign-off, Portfolio of Evidence generation, and public Statement of Results verification.

The project is built around a simple principle: assessment records should be useful while training is happening and defensible when audited later. Every portal, workflow, signature, generated PDF, attendance record, and verification link exists to keep the academic record complete, traceable, and aligned with QCTO, SETA, SAQA, and POPIA expectations.

## What It Does

- Provides separate portals for admins, facilitators, assessors, moderators, mentors, invigilators, and learners.
- Enforces profile and document-compliance gates before users reach operational dashboards.
- Manages programmes, QCTO-style qualification structures, cohorts, staff, learners, workplaces, and campus settings.
- Supports learner imports, programme imports, staging approval, staff provisioning, and branded account emails.
- Lets facilitators build assessments with sections, reading blocks, MCQs, written questions, multimodal tasks, checklists, logbooks, and QCTO workplace checkpoints.
- Releases assessments to cohorts with scheduling, invigilation, calendar invites, automated closing, and learner notifications.
- Captures learner evidence as text, files, URLs, audio, code, workplace reflections, logbook entries, declarations, and sign-offs.
- Routes submissions through facilitator review, assessor grading, moderation, remediation, appeals, and historical attempt snapshots.
- Generates Master Portfolio of Evidence PDFs for audit-ready learner records.
- Produces Statements of Results with QR verification, public lookup, PDF export, and optional blockchain/IPFS credential verification.
- Tracks attendance, live attendance boards, kiosk PIN flows, curriculum delivery acknowledgements, and traceability records.
- Integrates operational reporting, certificate studio tooling, ecosystem events, and workplace placement management.

## Core User Flows

1. Admins configure institution settings, campuses, programmes, staff, cohorts, learners, workplaces, access, and certificate assets.
2. Facilitators deliver curriculum, build assessments, track attendance, review submissions, and maintain cohort evidence.
3. Learners complete compliance setup, launch assigned assessments, submit PoE evidence, acknowledge delivered curriculum, and view outcomes.
4. Assessors apply marking decisions and feedback, including competent/not-yet-competent outcomes and remediation requirements.
5. Moderators review sampled or assigned work, endorse or return decisions, and preserve the green-pen audit layer.
6. Mentors and workplaces support practical/workplace evidence, placements, and sign-off requirements.
7. The system compiles the resulting record into PoE exports, Statements of Results, verification pages, and audit trails.

## Tech Stack

- React 19, TypeScript, Vite, and React Router 7 for the web application.
- Firebase Auth, Firestore, Storage, Hosting, and Cloud Functions for identity, data, files, hosting, and backend workflows.
- Zustand with Immer for client-side application state.
- Firebase Functions on Node 22 for account provisioning, email, assessment scheduling, PoE generation, attendance automation, AI helpers, and credential issuing.
- PDF and document tooling through Puppeteer, pdf-lib, jsPDF, html2canvas, and xlsx.
- Mailgun and Nodemailer for transactional platform emails.
- Google Maps/Search integrations for address and workplace capture.
- Sentry for frontend and function observability when configured.
- ethers, Pinata/IPFS, QR codes, and smart-contract reads/writes for credential verification flows.

## Repository Layout

```text
.
|-- src/
|   |-- App.tsx                         # Route map, auth sync, role redirects, compliance gates
|   |-- auth/                           # Protected route and role guards
|   |-- components/                     # Shared UI, dashboards, admin tools, assessment widgets
|   |-- lib/                            # Firebase and Sentry setup
|   |-- pages/                          # Role portals and feature screens
|   |-- store/                          # Zustand store and Firestore actions
|   `-- types/                          # Learner, auth, dashboard, assessment, and ecosystem types
|-- public/templates/                   # CSV/XLSX import templates
|-- server/functions/                   # Firebase Cloud Functions source
|-- firebase.json                       # Hosting config for the Vite app
|-- server/firebase.json                # Functions config
`-- vite.config.ts                      # Vite and Sentry sourcemap configuration
```

## Local Development

Use Node 22 where possible so local tooling matches the Cloud Functions runtime.

```bash
npm install
npm run dev
```

The Vite app starts on the default Vite port unless another port is already in use.

To build the frontend:

```bash
npm run build
```

To run linting:

```bash
npm run lint
```

Cloud Functions live in `server/functions` and have their own dependencies and build step:

```bash
cd server/functions
npm install
npm run build
```

To run the functions emulator from the functions package:

```bash
cd server/functions
npm run serve
```

## Environment

The frontend reads Firebase and integration settings through Vite environment variables. Required Firebase values:

```bash
VITE_API_KEY=
VITE_AUTH_DOMAIN=
VITE_PROJECT_ID=
VITE_STORAGE_BUCKET=
VITE_MESSAGING_SENDER_ID=
VITE_APP_ID=
```

Common optional frontend values:

```bash
VITE_MEASUREMENT_ID=
VITE_APP_URL=
VITE_SDP_CODE=
VITE_GOOGLE_MAPS_API_KEY=
VITE_PINATA_JWT=
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=
VITE_SENTRY_RELEASE=
```

Cloud Functions use Firebase Secret Manager and runtime environment values. Configure only the services needed by the environment:

```bash
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
INSTITUTION_PRIVATE_KEY=
OPENAI_API_KEY=
RPC_URL=
CONTRACT_ADDRESS=
PINATA_JWT=
POE_SMTP_USER=
POE_SMTP_APP_PASSWORD=
SENTRY_FUNCTIONS_DSN=
SENTRY_ENVIRONMENT=
SENTRY_RELEASE=
```

Do not commit secret values. Keep local `.env` files private and confirm the active Firebase project before deploying.

## Firebase Projects and Deployment

There are two Firebase config roots:

- The repository root contains the Hosting configuration for the Vite build.
- `server/` contains the Cloud Functions configuration.

Check the active project in `.firebaserc` and `server/.firebaserc` before any deploy.

Deploy hosting from the repository root:

```bash
npm run build
firebase deploy --only hosting
```

Deploy functions from the `server` directory:

```bash
cd server
firebase deploy --only functions
```

## Important Data Areas

The app is organised around Firestore-backed operational records:

- `users` for authenticated role profiles and compliance status.
- `learners` for learner identity records.
- `enrollments` for academic records tied to cohorts and qualifications.
- `programmes` for qualification and module templates.
- `cohorts` for delivery groups, staff assignments, campuses, and learner membership.
- `assessments` for authored workbooks, tasks, schedules, and module metadata.
- `learner_submissions` for evidence, marks, declarations, review layers, moderation, appeals, and history.
- `poe_export_requests` for Master PoE generation jobs.
- Settings, employers, attendance, curriculum logs, certificates, and ecosystem event collections support the surrounding operations.

## Development Notes

- Keep changes aligned with the role-based workflow. A learner-facing change often affects facilitator review, assessor grading, moderation, and PoE output.
- Treat generated academic records as compliance artifacts. Preserve timestamps, actor IDs, signatures, status transitions, and historical attempts.
- Avoid placing private credentials, raw ID documents, learner PII, or long-lived download URLs in logs.
- When changing functions, run `npm run build` in `server/functions` before deploying.
- When changing frontend routes, confirm the role guard and root redirect behavior in `src/App.tsx`.
- When changing assessment submission data, check the Assessment Player, Submission Review, Portfolio View, Statement of Results, and Master PoE generator together.
