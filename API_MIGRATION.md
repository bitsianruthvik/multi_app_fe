# API Centralization Migration Guide

## Overview

The frontend has been refactored to centralize all API calls through a single environment-driven client. All API requests now use `VITE_API_BASE_URL` from the environment.

## Key Changes

### 1. New Centralized API Client (`src/api/client.ts`)

- **Location**: `src/api/client.ts`
- **Purpose**: Single source of truth for all API requests
- **Features**:
  - Automatically attaches JWT tokens from localStorage
  - Sets proper Content-Type headers
  - Handles timeouts and errors consistently
  - No hardcoded URLs

**Usage Example**:

```typescript
import { apiFetch, apiGet, apiPost } from "../api/client";

// GET request
const data = await apiGet<User[]>("/api/users");

// POST request
const result = await apiPost("/api/login", { username, password });

// Generic fetch with options
const response = await apiFetch("/api/data", {
  method: "POST",
  body: { key: "value" },
  timeout: 5000,
});
```

### 2. Updated `axiosConfig.ts`

- **Removed**: All hardcoded localhost URLs and complex fallback logic
- **Now uses**: `VITE_API_BASE_URL` exclusively from environment
- **Simplified**: Cleaner, more maintainable code
- **Still supports**: Company/app slug routing

### 3. Fallback Handling

Added graceful fallback data handling in key components to prevent UI crashes:

**Dashboard.tsx**:

- Medicines loading: Falls back to `["Medicine A", "Medicine B", "Medicine C"]`
- Recordings loading: Falls back to empty array `[]`

**CallHistory.tsx**:

- History loading: Falls back to empty array `[]`

### 4. Environment Configuration

**Required Environment Variable**:

```bash
VITE_API_BASE_URL=http://localhost:4000
```

**Setup**:

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Update `VITE_API_BASE_URL` for your environment:
   - **Development**: `http://localhost:4000`
   - **Production**: `https://api.yourdomain.com`
   - **Railway**: `https://your-app.railway.app`

### 5. What Was Removed

- ❌ All hardcoded `localhost:4000` URLs
- ❌ Complex dev/prod detection logic
- ❌ Automatic fallback to `window.location.origin`
- ❌ Retry logic to localhost in axiosConfig
- ❌ References to `render.com` or other specific hosts

## Migration Checklist

### For Developers

- [x] Set `VITE_API_BASE_URL` in local `.env` file
- [x] Verify app builds: `npm run build`
- [x] Test app runs: `npm run dev`
- [x] Verify API calls work with backend running

### For DevOps/Deployment

- [x] Set `VITE_API_BASE_URL` in CI/CD environment
- [x] Update the production build environment (AWS: `VITE_API_HOST` in TM/lightsail)
- [x] Ensure build process includes environment variable
- [x] Test production deployment

## Testing

### 1. Test with Backend Running

```bash
# Terminal 1: Start backend
cd role-based-auth
npm start

# Terminal 2: Start frontend
cd frontend
VITE_API_BASE_URL=http://localhost:4000 npm run dev
```

### 2. Test with Backend Down (Fallback Behavior)

```bash
# Start frontend without backend
cd frontend
VITE_API_BASE_URL=http://localhost:9999 npm run dev
```

**Expected behavior**:

- UI loads without crashing
- Fallback data displays (e.g., placeholder medicines)
- Error messages shown where appropriate
- No uncaught exceptions

### 3. Test Production Build

```bash
VITE_API_BASE_URL=https://your-production-api.com npm run build
```

## Troubleshooting

### Error: "VITE_API_BASE_URL is not defined"

**Solution**: Create `.env` file with `VITE_API_BASE_URL=http://localhost:4000`

### API calls failing with CORS errors

**Solution**:

1. Verify backend CORS settings allow frontend origin
2. Check `VITE_API_BASE_URL` points to correct backend
3. Ensure backend is running and accessible

### Fallback data showing instead of real data

**Solution**:

1. Check browser console for API errors
2. Verify `VITE_API_BASE_URL` is correct
3. Test backend endpoint directly (e.g., with curl/Postman)
4. Check network tab in DevTools for request details

## Architecture Benefits

### Before ❌

- URLs scattered across multiple files
- Hardcoded localhost references
- Complex dev/prod detection
- Difficult to change backend URL
- Inconsistent error handling

### After ✅

- Single source of truth (`VITE_API_BASE_URL`)
- Clean separation of concerns
- Environment-driven configuration
- Easy to switch backends
- Consistent error handling and fallbacks
- UI resilient to backend failures

## Files Changed

### Created

- `src/api/client.ts` - New centralized API client
- `.env.example` - Environment template

### Modified

- `src/utils/axiosConfig.ts` - Simplified to use env variable
- `src/pages/user/Dashboard.tsx` - Added fallback handling
- `src/pages/user/CallHistory.tsx` - Added fallback handling

### Unchanged (but now use environment variable)

- `src/api-builder/client.ts` - Uses `API_HOST` from axiosConfig
- `src/contexts/AuthContext.tsx` - Uses axios instance
- All other components using the query builder

## Future Improvements

1. **Migrate all components to use new `apiFetch`**: Currently, some components still use the axios instance. Consider migrating to the new fetch-based client for consistency.

2. **Enhanced error handling**: Add retry logic, exponential backoff, and circuit breaker patterns in the centralized client.

3. **Type safety**: Export typed API functions for each endpoint to ensure compile-time safety.

4. **Monitoring**: Add request/response logging for debugging and analytics.

## Questions?

If you encounter issues or have questions about this migration, please:

1. Check this guide first
2. Review the browser console for errors
3. Verify environment variables are set correctly
4. Test with the backend running locally
