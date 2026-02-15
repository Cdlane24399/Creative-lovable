# Implementation Plan — Unimplemented Features

> **Generated:** February 14, 2026
> **Status:** Planning — each section is a self-contained work item that can be tackled independently or in parallel.

---

## Table of Contents

1. [Profile System](#1-profile-system)
2. [GitHub Integration (Sync to GitHub)](#2-github-integration-sync-to-github)
3. [Vercel Deployment (Publish Button)](#3-vercel-deployment-publish-button)
4. [Share Functionality](#4-share-functionality)
5. [Upgrade / Billing Flow](#5-upgrade--billing-flow)
6. [Integration Settings (Connect/Disconnect UI)](#6-integration-settings-connectdisconnect-ui)
7. [Project Settings Persistence](#7-project-settings-persistence)
8. [Account Management (Delete Account)](#8-account-management-delete-account)
9. [Editor Header User Data](#9-editor-header-user-data)
10. [Next.js Middleware (Session Refresh)](#10-nextjs-middleware-session-refresh)
11. [Landing Page Cleanup](#11-landing-page-cleanup)
12. [Miscellaneous Placeholders](#12-miscellaneous-placeholders)

---

## Dependency Graph

```
                    ┌─────────────────────┐
                    │  10. Middleware      │  ← Do this FIRST (all auth features depend on it)
                    │  (session refresh)   │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼──────┐  ┌────▼────────────┐
     │ 1. Profile  │  │ 6. Settings │  │ 8. Account Mgmt │
     │    System   │  │  Connect UI │  │  (Delete Acct)  │
     └────────┬───┘  └──────┬──────┘  └─────────────────┘
              │              │
              │     ┌────────┼────────┐
              │     │                 │
         ┌────▼─────▼──┐     ┌───────▼───────┐
         │ 2. GitHub    │     │ 3. Vercel     │
         │    Sync      │     │    Deploy     │
         └──────────────┘     └───────────────┘

  Independent (no prerequisites):
    4. Share Functionality
    5. Upgrade/Billing
    7. Project Settings Persistence
    9. Editor Header User Data
    11. Landing Page Cleanup
    12. Misc Placeholders
```

---

## 1. Profile System

### Current State

- `profiles` DB table exists in `lib/db/schema.sql` with columns: `id`, `username`, `full_name`, `avatar_url`, `bio`, `website`, `updated_at`
- Migration exists (`supabase/migrations/`)
- **No `ProfileRepository`** — no data access layer
- **No `ProfileService`** — no business logic layer
- **No API endpoints** for profile CRUD
- Profile page (`app/profile/page.tsx`) uses **hardcoded mock data** (username: "chris_dev", fullName: "Chris Developer")
- Profile form (`components/settings/profile-form.tsx`) submit handler is a **simulated `setTimeout`** — no API call
- Profile view (`components/profile/profile-view.tsx`) has two literal "Placeholder" cards for activity/stats
- **No avatar upload** functionality anywhere (column exists but no storage config)

### Implementation Steps

#### 1.1 Create `ProfileRepository`

- **File:** `lib/db/repositories/profile.repository.ts`
- **Pattern:** Extend `BaseRepository<Profile>` following `integration.repository.ts` as template
- **Methods:** `findById(userId)`, `findByUsername(username)`, `upsert(data)`, `updateAvatar(userId, url)`, `delete(userId)`
- **Export:** Add singleton getter `getProfileRepository()` to `lib/db/repositories/index.ts`

#### 1.2 Create `ProfileService`

- **File:** `lib/services/profile.service.ts`
- **Pattern:** Follow `project.service.ts` as template
- **Methods:** `getProfile(userId)`, `updateProfile(userId, data)`, `uploadAvatar(userId, file)`, `deleteProfile(userId)`, `ensureProfileExists(userId, email)`
- **Logic:**
  - Auto-create profile on first access (from Supabase auth user metadata)
  - Avatar upload via Supabase Storage (create a `avatars` bucket)
  - Username uniqueness validation
- **Export:** Add `getProfileService()` to `lib/services/index.ts`

#### 1.3 Create Profile API Routes

- **File:** `app/api/profile/route.ts`
  - `GET` — Return current user's profile (via `withAuth`)
  - `PATCH` — Update profile fields (username, full_name, bio, website)
- **File:** `app/api/profile/avatar/route.ts`
  - `POST` — Upload avatar image (multipart form data → Supabase Storage → update `avatar_url`)
  - `DELETE` — Remove avatar
- **Validation:** Add `updateProfileSchema` to `lib/validations.ts`
- **Auth:** Wrap with `withAuth` + `asyncErrorHandler`

#### 1.4 Wire Profile Page to Real Data

- **File:** `app/profile/page.tsx`
  - Fetch profile from `/api/profile` (or server-side via repository directly)
  - Remove hardcoded mock data
  - Show real user data from Supabase auth + profiles table
  - Add SSR with auth check (redirect to `/login` if unauthenticated)

#### 1.5 Wire Profile Form to Real API

- **File:** `components/settings/profile-form.tsx`
  - Replace `setTimeout` simulation with `fetch('/api/profile', { method: 'PATCH', body })`
  - Load initial data from `/api/profile` on mount
  - Show validation errors from API response
  - Add avatar upload component (file input → `/api/profile/avatar`)

#### 1.6 Replace Profile View Placeholders

- **File:** `components/profile/profile-view.tsx`
  - Replace "Recent Activity Placeholder" card with real project activity (recent projects from `ProjectService`)
  - Replace "Stats Placeholder" card with real stats (project count, total messages, etc.)
  - Show real avatar from `avatar_url` instead of fallback letter

#### 1.7 Configure Supabase Storage for Avatars

- Create `avatars` bucket in Supabase Storage
- Add RLS policies: users can upload/delete their own avatars
- Add image size limits (e.g., 2MB max)
- Generate public URL for avatar display

### Files to Create

| File                                                       | Type       |
| ---------------------------------------------------------- | ---------- |
| `lib/db/repositories/profile.repository.ts`                | Repository |
| `lib/services/profile.service.ts`                          | Service    |
| `app/api/profile/route.ts`                                 | API Route  |
| `app/api/profile/avatar/route.ts`                          | API Route  |
| `lib/db/repositories/__tests__/profile.repository.test.ts` | Test       |

### Files to Modify

| File                                   | Change                                      |
| -------------------------------------- | ------------------------------------------- |
| `lib/db/repositories/index.ts`         | Export `getProfileRepository()`             |
| `lib/services/index.ts`                | Export `getProfileService()`                |
| `lib/validations.ts`                   | Add `updateProfileSchema`                   |
| `app/profile/page.tsx`                 | Replace mock data with real API calls       |
| `components/profile/profile-view.tsx`  | Replace placeholder cards, wire real avatar |
| `components/settings/profile-form.tsx` | Wire to real API, add avatar upload         |
| `app/settings/page.tsx`                | Pass initial data to `ProfileForm`          |
| `lib/db/types.ts`                      | Add `Profile` type if not present           |

### Estimated Effort: **Medium-Large** (2-3 days)

---

## 2. GitHub Integration (Sync to GitHub)

### Current State

- GitHub **OAuth login** (Supabase auth) works — signs users in via GitHub
- GitHub **integration OAuth** (API token acquisition) works — `app/api/integrations/[provider]/route.ts` redirects to GitHub, exchanges code for token, encrypts and stores in DB
- **Integration repository** is fully implemented — can store/retrieve GitHub tokens
- **Encryption layer** works — AES-256-GCM for tokens at rest
- Editor header GitHub button is **disabled** with `{/* TODO: Implement GitHub integration */}`
- **No GitHub API client** exists (no Octokit, no `api.github.com` calls)
- **No repo creation, push, commit, or sync** functionality
- The README explicitly lists `- [ ] Git Integration: Version control, commit management` as unimplemented

### Implementation Steps

#### 2.1 Install GitHub API Client

- Add `octokit` (or `@octokit/rest`) to dependencies
- Create `lib/github/client.ts` — factory function that creates an authenticated Octokit instance from stored encrypted token

#### 2.2 Create GitHub Service

- **File:** `lib/services/github.service.ts`
- **Methods:**
  - `getClient(userId)` — Retrieve & decrypt stored token, create Octokit instance
  - `listRepositories(userId)` — List user's GitHub repos
  - `createRepository(userId, name, description, isPrivate)` — Create new repo
  - `pushFiles(userId, repoName, files[], commitMessage)` — Push sandbox files to repo
  - `syncToGitHub(userId, projectId, repoName)` — Full sync: read sandbox files → create/update repo → push all
  - `getConnectionStatus(userId)` — Check if GitHub token exists and is valid
- **Export:** Add `getGitHubService()` to `lib/services/index.ts`

#### 2.3 Create GitHub API Routes

- **File:** `app/api/github/repos/route.ts`
  - `GET` — List user's GitHub repos (for repo picker UI)
  - `POST` — Create new repository
- **File:** `app/api/github/sync/route.ts`
  - `POST` — Sync project files to a GitHub repo `{ projectId, repoName, commitMessage }`
- **File:** `app/api/github/status/route.ts`
  - `GET` — Check GitHub connection status (token exists + valid)
- **Validation:** Add schemas to `lib/validations.ts`
- **Auth:** Wrap all with `withAuth`

#### 2.4 Create GitHub Sync Dialog Component

- **File:** `components/features/github-sync-dialog.tsx`
- **UI:**
  - Modal/dialog triggered from editor header GitHub button
  - If not connected: show "Connect GitHub" button → redirects to OAuth flow
  - If connected: show repo picker (existing repos) or "Create New Repo" form
  - Commit message input field
  - "Sync to GitHub" action button with progress indicator
  - Success/error toast notifications

#### 2.5 Wire Editor Header GitHub Button

- **File:** `components/editor-header.tsx`
- Remove `disabled` prop and TODO comment
- Add `onClick` handler that opens the GitHub sync dialog
- Show connection status indicator (green dot if connected)

#### 2.6 (Optional) Add GitHub AI Agent Tool

- **File:** `lib/ai/tools/github.tools.ts`
- Tool: `syncToGitHub` — allows the AI agent to push project files to GitHub on user request
- Register in `lib/ai/tools/index.ts` and `lib/ai/web-builder-agent.ts`

#### 2.7 Environment Variables

- Document `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env.example`
- Add validation in `lib/env.ts` (optional, warn if missing)

### Files to Create

| File                                         | Type                      |
| -------------------------------------------- | ------------------------- |
| `lib/github/client.ts`                       | GitHub API client factory |
| `lib/services/github.service.ts`             | Service                   |
| `app/api/github/repos/route.ts`              | API Route                 |
| `app/api/github/sync/route.ts`               | API Route                 |
| `app/api/github/status/route.ts`             | API Route                 |
| `components/features/github-sync-dialog.tsx` | Component                 |
| `lib/ai/tools/github.tools.ts`               | AI Tool (optional)        |

### Files to Modify

| File                           | Change                                         |
| ------------------------------ | ---------------------------------------------- |
| `package.json`                 | Add `octokit` or `@octokit/rest` dependency    |
| `components/editor-header.tsx` | Enable GitHub button, add dialog trigger       |
| `lib/services/index.ts`        | Export `getGitHubService()`                    |
| `lib/validations.ts`           | Add GitHub-related schemas                     |
| `lib/ai/tools/index.ts`        | Export GitHub tools (optional)                 |
| `lib/ai/web-builder-agent.ts`  | Register GitHub tools (optional)               |
| `.env.example`                 | Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |

### Estimated Effort: **Large** (3-4 days)

---

## 3. Vercel Deployment (Publish Button)

### Current State

- Vercel **OAuth flow** works — `app/api/integrations/[provider]/route.ts` handles Vercel OAuth, exchanges code, stores encrypted token
- **Integration repository** can store/retrieve Vercel tokens
- Publish button in editor header is **disabled** with `{/* TODO: Implement publish/deploy functionality */}`
- Project settings has a **hardcoded fake deployments list** (3 dummy entries)
- **No Vercel Deployments API calls** exist anywhere
- **No deploy tools** in the AI agent
- `@vercel/sandbox` is installed but used for code execution, not deployment

### Implementation Steps

#### 3.1 Create Vercel Deployment Service

- **File:** `lib/services/vercel.service.ts`
- **Methods:**
  - `getClient(userId)` — Retrieve & decrypt Vercel token, create API client
  - `deployProject(userId, projectId, options)` — Deploy sandbox files to Vercel
    - Read all files from sandbox via `listFiles()` + `readFile()`
    - Call Vercel Deployments API (`POST https://api.vercel.com/v13/deployments`)
    - Upload files as a file tree
  - `getDeployments(userId, projectId)` — List past deployments for a project
  - `getDeploymentStatus(deploymentId)` — Check deployment status (building/ready/error)
  - `deleteDeployment(deploymentId)` — Remove a deployment
  - `getConnectionStatus(userId)` — Check if Vercel token exists and is valid
- **Export:** Add `getVercelService()` to `lib/services/index.ts`

#### 3.2 Create Vercel API Routes

- **File:** `app/api/deploy/route.ts`
  - `POST` — Deploy a project `{ projectId, name?, production? }`
  - Returns deployment URL and ID
- **File:** `app/api/deploy/[deploymentId]/route.ts`
  - `GET` — Get deployment status
  - `DELETE` — Delete deployment
- **File:** `app/api/deploy/list/route.ts`
  - `GET` — List deployments for a project `?projectId=xxx`

#### 3.3 Store Deployment History in Database

- **Migration:** Add `deployments` table
  ```sql
  CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    provider VARCHAR(50) DEFAULT 'vercel',
    deployment_id TEXT,           -- Vercel's deployment ID
    url TEXT,                     -- Deployment URL
    status VARCHAR(50),           -- building, ready, error, canceled
    commit_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- **Repository:** `lib/db/repositories/deployment.repository.ts`
- **Export:** `getDeploymentRepository()` in `lib/db/repositories/index.ts`

#### 3.4 Create Publish Dialog Component

- **File:** `components/features/publish-dialog.tsx`
- **UI:**
  - Modal triggered from Publish button
  - If Vercel not connected: show "Connect Vercel" → OAuth flow
  - If connected: show deployment options (project name, production vs preview)
  - Deploy button with progress (building → deploying → ready)
  - Show deployment URL on success with "Open" link
  - Deployment history list (past deploys with status, URL, timestamp)

#### 3.5 Wire Editor Header Publish Button

- **File:** `components/editor-header.tsx`
- Remove `disabled` prop and TODO comment
- Add `onClick` handler that opens the publish dialog
- Show deploy status indicator (if currently deploying)

#### 3.6 Replace Project Settings Deployments Stub

- **File:** `components/project-settings.tsx`
- Remove hardcoded fake deployment data
- Fetch real deployments from `/api/deploy/list?projectId=xxx`
- Show real status, URLs, timestamps
- Add "Redeploy" action per deployment

#### 3.7 (Optional) Add Deploy AI Agent Tool

- **File:** `lib/ai/tools/deploy.tools.ts`
- Tool: `deployToVercel` — allows AI agent to deploy on user request
- Register in tool index and web builder agent

#### 3.8 Environment Variables

- Document `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET` in `.env.example`

### Files to Create

| File                                                     | Type               |
| -------------------------------------------------------- | ------------------ |
| `lib/services/vercel.service.ts`                         | Service            |
| `app/api/deploy/route.ts`                                | API Route          |
| `app/api/deploy/[deploymentId]/route.ts`                 | API Route          |
| `app/api/deploy/list/route.ts`                           | API Route          |
| `lib/db/repositories/deployment.repository.ts`           | Repository         |
| `supabase/migrations/YYYYMMDD_add_deployments_table.sql` | Migration          |
| `components/features/publish-dialog.tsx`                 | Component          |
| `lib/ai/tools/deploy.tools.ts`                           | AI Tool (optional) |

### Files to Modify

| File                              | Change                                         |
| --------------------------------- | ---------------------------------------------- |
| `components/editor-header.tsx`    | Enable Publish button, add dialog trigger      |
| `components/project-settings.tsx` | Replace dummy deployments with real data       |
| `lib/db/repositories/index.ts`    | Export `getDeploymentRepository()`             |
| `lib/services/index.ts`           | Export `getVercelService()`                    |
| `lib/validations.ts`              | Add deploy-related schemas                     |
| `lib/db/types.ts`                 | Add `Deployment` type                          |
| `.env.example`                    | Add `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` |

### Estimated Effort: **Large** (3-5 days)

---

## 4. Share Functionality

### Current State

- Share button in editor header is **disabled** with `{/* TODO: Implement share functionality */}`
- No sharing mechanism exists

### Implementation Steps

#### 4.1 Design Share Options

Choose which sharing modes to support:

- **Share link** — Generate a public URL to view the project's preview (read-only)
- **Invite collaborator** — Share with another user by email (future)
- **Export** — Download project as ZIP

#### 4.2 Create Share API Routes

- **File:** `app/api/projects/[id]/share/route.ts`
  - `POST` — Generate a share token / public slug for the project
  - `DELETE` — Revoke share link
  - `GET` — Get current share status

#### 4.3 Add Share Token to Projects Table

- **Migration:** Add `share_token` and `is_public` columns to `projects` table
  ```sql
  ALTER TABLE projects ADD COLUMN share_token TEXT UNIQUE;
  ALTER TABLE projects ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
  ```

#### 4.4 Create Public Preview Route

- **File:** `app/share/[token]/page.tsx`
- Loads project by share token, renders read-only preview (iframe to sandbox URL or static snapshot)

#### 4.5 Create Share Dialog Component

- **File:** `components/features/share-dialog.tsx`
- **UI:**
  - Modal triggered from Share button
  - Toggle: Make project public / private
  - Copy share link button
  - QR code (optional, nice-to-have)
  - Download as ZIP button

#### 4.6 Wire Editor Header Share Button

- **File:** `components/editor-header.tsx`
- Remove `disabled` and TODO comment
- Add `onClick` to open share dialog

### Files to Create

| File                                                 | Type        |
| ---------------------------------------------------- | ----------- |
| `app/api/projects/[id]/share/route.ts`               | API Route   |
| `app/share/[token]/page.tsx`                         | Public page |
| `components/features/share-dialog.tsx`               | Component   |
| `supabase/migrations/YYYYMMDD_add_share_columns.sql` | Migration   |

### Files to Modify

| File                                        | Change              |
| ------------------------------------------- | ------------------- |
| `components/editor-header.tsx`              | Enable Share button |
| `lib/db/repositories/project.repository.ts` | Add share methods   |
| `lib/services/project.service.ts`           | Add share logic     |

### Estimated Effort: **Medium** (1-2 days)

---

## 5. Upgrade / Billing Flow

### Current State

- Upgrade button in editor header is **disabled** with `{/* TODO: Implement upgrade/billing flow */}`
- No billing, subscription, or payment system exists

### Implementation Steps

#### 5.1 Choose Payment Provider

- **Recommended:** Stripe (most common for SaaS)
- Alternative: Lemon Squeezy, Paddle

#### 5.2 Define Pricing Tiers

- Example: Free (limited projects/messages), Pro ($X/mo), Team ($Y/mo)
- Determine feature gates (max projects, max messages/day, model access, deploy frequency)

#### 5.3 Integrate Stripe

- **Dependencies:** `stripe`, `@stripe/stripe-js`
- **File:** `lib/stripe/client.ts` — server-side Stripe client
- **File:** `lib/stripe/config.ts` — price IDs, tier definitions
- **API Routes:**
  - `app/api/billing/checkout/route.ts` — Create Stripe Checkout session
  - `app/api/billing/portal/route.ts` — Create Stripe Customer Portal session
  - `app/api/billing/webhook/route.ts` — Handle Stripe webhooks (subscription created/updated/canceled)

#### 5.4 Add Subscription Tracking

- **Migration:** Add `subscriptions` table or add `stripe_customer_id`, `subscription_tier` to `profiles`
- **Repository + Service:** Subscription management

#### 5.5 Create Upgrade Dialog / Pricing Page

- **File:** `components/features/upgrade-dialog.tsx` or `app/pricing/page.tsx`
- Show pricing tiers, feature comparison, checkout button

#### 5.6 Wire Editor Header Upgrade Button

- **File:** `components/editor-header.tsx`
- Remove `disabled` and TODO
- Open upgrade dialog or redirect to pricing page

#### 5.7 Implement Usage Limits

- Check subscription tier before allowing operations (project creation, chat messages, deploys)
- Show upgrade prompts when limits are reached

### Estimated Effort: **Very Large** (5-7 days) — scope depends heavily on pricing complexity

---

## 6. Integration Settings (Connect/Disconnect UI)

### Current State

- `components/settings/integrations-list.tsx`:
  - `isConnected` is **hardcoded to `false`** — never reads from database
  - `handleConnect` redirects to `/api/integrations/${provider}/connect` — **wrong URL** (should be `/api/integrations/${provider}`)
  - `handleDisconnect` is a **fake `setTimeout`** — no actual API call
- Integration card UI (`integration-card.tsx`) is well-built, just receives fake data
- The OAuth flow backend works and stores tokens, but there's no way to check status or disconnect

### Implementation Steps

#### 6.1 Create Integration Status API Route

- **File:** `app/api/integrations/status/route.ts`
  - `GET` — Return connection status for all providers `{ github: { connected: true, connectedAt: ... }, vercel: { connected: false } }`
  - Uses `IntegrationRepository.findByUserAndProvider()` for each provider

#### 6.2 Create Integration Disconnect API Route

- Add `DELETE` handler to existing `app/api/integrations/[provider]/route.ts`
  - Delete integration record via `IntegrationRepository.deleteByUserAndProvider(userId, provider)`
  - Return success response

#### 6.3 Create Integration Service (Optional)

- **File:** `lib/services/integration.service.ts`
- **Methods:** `getStatus(userId)`, `disconnect(userId, provider)`, `isConnected(userId, provider)`
- Centralizes integration logic instead of calling repository directly from API routes

#### 6.4 Fix Integration Settings Component

- **File:** `components/settings/integrations-list.tsx`
  - Fetch real connection status from `/api/integrations/status` on mount
  - Fix `handleConnect` URL: change `/api/integrations/${provider}/connect` → `/api/integrations/${provider}`
  - Replace fake `handleDisconnect` with real `DELETE /api/integrations/${provider}` call
  - Show `integration_success` toast when redirected from OAuth with `?integration_success=true`
  - Re-fetch status after connect/disconnect

### Files to Create

| File                                   | Type               |
| -------------------------------------- | ------------------ |
| `app/api/integrations/status/route.ts` | API Route          |
| `lib/services/integration.service.ts`  | Service (optional) |

### Files to Modify

| File                                        | Change                                     |
| ------------------------------------------- | ------------------------------------------ |
| `app/api/integrations/[provider]/route.ts`  | Add `DELETE` handler                       |
| `components/settings/integrations-list.tsx` | Fix URLs, wire real state, real disconnect |
| `lib/services/index.ts`                     | Export `getIntegrationService()`           |

### Estimated Effort: **Small** (0.5-1 day)

---

## 7. Project Settings Persistence

### Current State

- `components/project-settings.tsx`:
  - **Environment variables** are hardcoded mock data (`NEXT_PUBLIC_API_URL`, `DATABASE_URL`)
  - **Visibility** toggle (public/private) is local state only
  - **AI Configuration** (model selector, system prompt) is local state only
  - **Save button** has **no `onClick` handler**
  - **Deployments section** is hardcoded fake data (covered in Section 3)

### Implementation Steps

#### 7.1 Create Project Settings API

- Extend existing `app/api/projects/[id]/route.ts` PATCH handler to accept:
  - `visibility` (public/private)
  - `envVars` (key-value pairs)
  - `aiModel` (selected model key)
  - `systemPrompt` (custom system prompt override)

#### 7.2 Add Settings Columns to Projects Table

- **Migration:**
  ```sql
  ALTER TABLE projects ADD COLUMN visibility VARCHAR(20) DEFAULT 'private';
  ALTER TABLE projects ADD COLUMN env_vars JSONB DEFAULT '[]';
  ALTER TABLE projects ADD COLUMN ai_model VARCHAR(50);
  ALTER TABLE projects ADD COLUMN custom_system_prompt TEXT;
  ```

#### 7.3 Wire Project Settings Component

- **File:** `components/project-settings.tsx`
  - Load real settings from API on mount (`GET /api/projects/${projectId}`)
  - Replace mock env vars with real data
  - Add `onClick` to Save button → `PATCH /api/projects/${projectId}`
  - Show success/error toast on save
  - Handle env var add/remove with proper state management

#### 7.4 Use Project Settings in Chat

- Pass `aiModel` from project settings to the chat API call
- Inject `envVars` into the sandbox environment when starting dev server
- Apply `customSystemPrompt` as an addendum to the agent's system prompt

### Files to Modify

| File                                        | Change                        |
| ------------------------------------------- | ----------------------------- |
| `components/project-settings.tsx`           | Wire to API, remove mock data |
| `lib/db/repositories/project.repository.ts` | Support new columns           |
| `app/api/projects/[id]/route.ts`            | Handle new fields in PATCH    |
| `lib/validations.ts`                        | Update `updateProjectSchema`  |

### Files to Create

| File                                                    | Type      |
| ------------------------------------------------------- | --------- |
| `supabase/migrations/YYYYMMDD_add_project_settings.sql` | Migration |

### Estimated Effort: **Medium** (1-2 days)

---

## 8. Account Management (Delete Account)

### Current State

- `app/settings/page.tsx` has a "Delete Account" button with **no `onClick` handler**
- No confirmation dialog
- No API endpoint for account deletion

### Implementation Steps

#### 8.1 Create Account Deletion API

- **File:** `app/api/account/route.ts`
  - `DELETE` — Delete user account
  - Steps:
    1. Delete all user's projects (cascade to messages, context, etc.)
    2. Delete all user's integrations
    3. Delete user's profile
    4. Delete Supabase auth user via admin API (`supabase.auth.admin.deleteUser()`)
    5. Optionally: clean up sandbox resources
  - Require password confirmation or re-authentication

#### 8.2 Create Confirmation Dialog

- **File:** `components/features/delete-account-dialog.tsx`
- **UI:**
  - "Are you sure?" modal with consequences listed
  - Type project name or "DELETE" to confirm
  - Calls `DELETE /api/account`
  - Signs out and redirects to landing page on success

#### 8.3 Wire Settings Page

- **File:** `app/settings/page.tsx`
  - Add `onClick` to Delete Account button → opens confirmation dialog
  - Import and render `DeleteAccountDialog`

### Files to Create

| File                                            | Type      |
| ----------------------------------------------- | --------- |
| `app/api/account/route.ts`                      | API Route |
| `components/features/delete-account-dialog.tsx` | Component |

### Files to Modify

| File                    | Change                     |
| ----------------------- | -------------------------- |
| `app/settings/page.tsx` | Wire Delete Account button |

### Estimated Effort: **Small** (0.5-1 day)

---

## 9. Editor Header User Data

### Current State

- User avatar shows hardcoded **"U"** character — not connected to actual user
- Dropdown shows hardcoded **"Username"** text
- "Log out" menu item has **no `onClick` handler**
- Profile/Settings links work but display generic info

### Implementation Steps

#### 9.1 Fetch User Data in Editor Header

- **File:** `components/editor-header.tsx`
- Use the `useAuth()` hook to get the current user
- Fetch profile data (avatar, username) from profile API or context
- Replace hardcoded "U" with user's actual initial or avatar image
- Replace "Username" with user's actual display name or email

#### 9.2 Implement Log Out Handler

- Add `onClick` to "Log out" menu item
- Call `supabase.auth.signOut()`
- Redirect to landing page or login page
- Clear any client-side caches

#### 9.3 (Optional) Create User Context Provider

- **File:** `components/contexts/user-context.tsx`
- Provide user profile data (from `useAuth` + profile fetch) to all components
- Avoids fetching profile in multiple places

### Files to Modify

| File                           | Change                                |
| ------------------------------ | ------------------------------------- |
| `components/editor-header.tsx` | Wire real user data, implement logout |

### Files to Create (Optional)

| File                                   | Type             |
| -------------------------------------- | ---------------- |
| `components/contexts/user-context.tsx` | Context provider |

### Estimated Effort: **Small** (0.5 day)

---

## 10. Next.js Middleware (Session Refresh)

### Current State

- `lib/supabase/middleware.ts` exports `updateSession()` — properly implements Supabase session refresh
- **No root `middleware.ts` file exists** — `updateSession()` is never called
- This means Supabase sessions are **not refreshed on navigation**, which will cause auth issues (sessions expire without refresh)

### Implementation Steps

#### 10.1 Create Root Middleware

- **File:** `middleware.ts` (project root)

  ```typescript
  import { type NextRequest } from "next/server";
  import { updateSession } from "@/lib/supabase/middleware";

  export async function middleware(request: NextRequest) {
    return await updateSession(request);
  }

  export const config = {
    matcher: [
      // Match all routes except static files and API health checks
      "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
  };
  ```

#### 10.2 Add Route Protection (Optional)

- Extend middleware to redirect unauthenticated users from protected routes (`/profile`, `/settings`, `/project/*`) to `/login`
- Allow public routes (`/`, `/login`, `/signup`, `/share/*`, `/api/health`)

### Files to Create

| File            | Type               |
| --------------- | ------------------ |
| `middleware.ts` | Next.js Middleware |

### Estimated Effort: **Minimal** (15-30 minutes)

### Priority: **HIGH** — this is a foundational requirement for all auth features

---

## 11. Landing Page Cleanup

### Current State

- **Company logos** are generic "Company 1-5" placeholders with gray box icons
- **Hero stats** are fabricated ("50K+ Developers", "2M+ Projects Built", "99.9% Uptime")
- **Testimonials** are fictional quotes from fake people
- **Testimonials stats section** has different fabricated numbers ("10K+ Developers", "50K+ Projects Built")

### Implementation Steps

#### 11.1 Remove or Replace Placeholder Content

- **Option A:** Remove company logos section entirely until real partnerships exist
- **Option B:** Replace with "Trusted by developers worldwide" without fake logos

#### 11.2 Replace Fabricated Stats

- Either remove stats entirely, replace with real metrics (if available), or use honest statements ("Join our growing community")

#### 11.3 Replace Testimonials

- Either remove section, replace with real user testimonials, or convert to feature highlights

### Files to Modify

| File                                          | Change                                 |
| --------------------------------------------- | -------------------------------------- |
| `components/landing/hero-section-v3.tsx`      | Remove/fix fake logos and stats        |
| `components/landing/testimonials-section.tsx` | Remove/fix fake testimonials and stats |

### Estimated Effort: **Small** (1-2 hours)

---

## 12. Miscellaneous Placeholders

### 12.1 Auth Error Page (Missing)

- **Issue:** `app/auth/callback/route.ts` redirects to `/auth/auth-code-error` on OAuth failure, but this page **doesn't exist**
- **Fix:** Create `app/(auth)/auth-code-error/page.tsx` with an error message and retry button
- **Effort:** 15 minutes

### 12.2 Landing Header Profile Links (Non-functional)

- **Issue:** `components/landing/header.tsx` has Profile, Billing, and Settings buttons in the user dropdown that are plain `<button>` elements with no `onClick` or `href`
- **Fix:** Add `href="/profile"`, `href="/settings"`, etc. or use `<Link>` components
- **Effort:** 15 minutes

### 12.3 Image Optimization (Disabled)

- **Issue:** `next.config.mjs` has `images.unoptimized: true` with TODO comment about CDN
- **Fix:** Configure a CDN or Vercel's built-in image optimization and set `unoptimized: false`
- **Effort:** 30 minutes (depends on CDN setup)

### 12.4 README Inaccuracies

- **Issue:** `README.md` references `generateComponent` and `searchWeb` tools that don't exist
- **Fix:** Remove or update tool references to match actual tool names
- **Effort:** 15 minutes

### 12.5 Tool Progress Placeholder (hooks)

- **Issue:** `hooks/use-chat-with-tools.ts` has a `getToolProgress` function that always returns `undefined`
- **Fix:** Implement with data streaming when AI SDK supports it, or remove if not planned
- **Effort:** N/A (depends on AI SDK feature availability)

### 12.6 Deprecated Code Cleanup

- `lib/cache.ts` — Remove re-export file, update all imports to use `lib/cache/cache-manager.ts` directly
- `lib/validations.ts` — Remove `messageRoleSchema` and `chatMessageSchema` deprecated exports
- `lib/ai/agent-context.ts` — Remove `setCurrentPlan()` and `completeStep()` deprecated functions
- `hooks/use-dev-server.ts` — Remove `startingPollInterval` deprecated option
- **Effort:** 1-2 hours

---

## Implementation Priority & Sequencing

### Phase 0 — Foundations (do first)

| #    | Item                 | Effort | Why First                                       |
| ---- | -------------------- | ------ | ----------------------------------------------- |
| 10   | Next.js Middleware   | 15 min | All auth features break without session refresh |
| 12.1 | Auth error page      | 15 min | OAuth failures currently show 404               |
| 12.2 | Landing header links | 15 min | Quick fix, visible to all users                 |

### Phase 1 — Core User Experience

| #   | Item                    | Effort    | Dependencies |
| --- | ----------------------- | --------- | ------------ |
| 1   | Profile System          | 2-3 days  | Phase 0      |
| 6   | Integration Settings UI | 0.5-1 day | Phase 0      |
| 9   | Editor Header User Data | 0.5 day   | Phase 0, #1  |
| 8   | Account Management      | 0.5-1 day | Phase 0, #1  |

### Phase 2 — Key Integrations

| #   | Item          | Effort   | Dependencies |
| --- | ------------- | -------- | ------------ |
| 2   | GitHub Sync   | 3-4 days | Phase 1 #6   |
| 3   | Vercel Deploy | 3-5 days | Phase 1 #6   |

### Phase 3 — Growth Features

| #   | Item                | Effort   | Dependencies                     |
| --- | ------------------- | -------- | -------------------------------- |
| 4   | Share Functionality | 1-2 days | None                             |
| 5   | Upgrade/Billing     | 5-7 days | #1 (profile), #3 (deploy limits) |
| 7   | Project Settings    | 1-2 days | None                             |

### Phase 4 — Polish

| #   | Item                 | Effort    | Dependencies |
| --- | -------------------- | --------- | ------------ |
| 11  | Landing Page Cleanup | 1-2 hours | None         |
| 12  | Misc Placeholders    | 2-3 hours | None         |

---

## Total Estimated Effort

| Phase     | Items        | Effort          |
| --------- | ------------ | --------------- |
| Phase 0   | Foundations  | ~1 hour         |
| Phase 1   | Core UX      | 4-6 days        |
| Phase 2   | Integrations | 6-9 days        |
| Phase 3   | Growth       | 7-11 days       |
| Phase 4   | Polish       | ~0.5 day        |
| **Total** |              | **~18-27 days** |

---

## Quick Reference — All Disabled/Placeholder Buttons

| Button             | Location                              | Status         | Section |
| ------------------ | ------------------------------------- | -------------- | ------- |
| GitHub             | `components/editor-header.tsx:274`    | Disabled, TODO | #2      |
| Share              | `components/editor-header.tsx:285`    | Disabled, TODO | #4      |
| Upgrade            | `components/editor-header.tsx:296`    | Disabled, TODO | #5      |
| Publish            | `components/editor-header.tsx:310`    | Disabled, TODO | #3      |
| Save Changes       | `components/project-settings.tsx:284` | No onClick     | #7      |
| Delete Account     | `app/settings/page.tsx:75`            | No onClick     | #8      |
| Log out (editor)   | `components/editor-header.tsx:367`    | No onClick     | #9      |
| Profile (landing)  | `components/landing/header.tsx`       | No href        | #12.2   |
| Billing (landing)  | `components/landing/header.tsx`       | No href        | #12.2   |
| Settings (landing) | `components/landing/header.tsx`       | No href        | #12.2   |
