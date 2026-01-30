# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GibroCash is a financial management frontend for handling imprests (advance payments), transactions, proposals, and user management. Built with React 19 + Vite 7 + React Router 7.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Production build
npm run lint     # ESLint check
npm run preview  # Preview production build
```

No test framework is currently configured.

## Architecture

### Directory Structure
- `src/pages/` - Page components (Dashboard, Login, Imprests, Transactions, Proposals, Users)
- `src/components/` - Reusable components (Layout, ProtectedRoute)
- `src/context/` - React Context (AuthContext for authentication state)
- `src/services/` - API layer (centralized Axios instance with interceptors)

### Key Patterns

**Authentication Flow**
- `AuthContext.jsx` manages global auth state via React Context
- Token stored in localStorage, attached via Axios request interceptor
- `ProtectedRoute` component wraps authenticated routes
- 403 responses trigger automatic logout and redirect to `/login`

**API Layer** (`services/api.js`)
- Centralized Axios instance with base URL from `VITE_API_BASE_URL`
- Services organized by domain: `authService`, `userService`, `imprestService`, `transactionService`, `proposalService`, `imageService`
- Request interceptor adds Bearer token; response interceptor handles 403 errors

**Role-Based Access**
- Admin users: see all imprests, manage users, approve/reject proposals
- Staff users: see only their imprests, create proposals
- `isAdmin()` helper in AuthContext checks `user.role === 'admin'`

**API Response Formats** (inconsistent - handle defensively)
- Most endpoints: `{ response: [...] }`
- Transactions: `{ transactions: { count, rows: [...] } }`
- Proposals: `{ response: "success", proposals: [...] }`

### Environment Variables
- `VITE_API_BASE_URL` - Backend API base URL (configured in `.env.development` and `.env.production`)

### Currency/Locale
- All amounts formatted as Kenyan Shillings (KES) using `Intl.NumberFormat('en-KE')`
