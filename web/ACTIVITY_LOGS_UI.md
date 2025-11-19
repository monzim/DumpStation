# Activity Logs UI Implementation

This document describes the web UI implementation for the Activity Logs feature in the PostgreSQL Backup Service.

## Overview

The Activity Logs UI provides a comprehensive interface for viewing and filtering system activity logs directly from the web dashboard. It follows the existing design patterns and integrates seamlessly with the current UI.

## Implementation Details

### 1. Type Definitions

**File:** `src/lib/types/api.ts`

Added TypeScript types for activity logs:
- `ActivityLogAction` - Union type for all possible actions
- `ActivityLogLevel` - Log severity levels (info, warning, error, success)
- `User` - User information type
- `ActivityLog` - Main activity log entry type
- `ActivityLogListParams` - Query parameters for filtering
- `ActivityLogListResponse` - Paginated response type

### 2. API Client

**File:** `src/lib/api/logs.ts`

React Query hooks for fetching activity logs:
- `useActivityLogs(params)` - Fetch logs with filtering and pagination
- `useActivityLog(id)` - Fetch single log entry by ID
- Auto-refetch every 30 seconds for real-time updates
- Intelligent query string building for filters

### 3. UI Component

**File:** `src/components/activity-log-list.tsx`

Comprehensive activity log viewer with:

#### Features
- **Real-time Updates**: Auto-refreshes every 30 seconds
- **Filtering**: Filter by log level, entity type
- **Pagination**: Configurable page size (25, 50, 100 records)
- **Visual Indicators**: Color-coded badges and icons for log levels
- **Responsive Design**: Works on mobile, tablet, and desktop
- **Loading States**: Skeleton loaders during data fetch
- **Error Handling**: Graceful error display with retry

#### Filter Options
- **Log Level**: All, Info, Success, Warning, Error
- **Entity Type**: All, User, Storage, Database, Backup, System
- **Results Per Page**: 25, 50, or 100 logs per page

#### Visual Design
Each log entry displays:
- Level-specific icon and color (Info = blue, Success = green, Warning = yellow, Error = red)
- Action label (user-friendly text)
- Full description
- Timestamp
- Entity name (if applicable)
- Username (if applicable)
- IP address (if available)

### 4. Navigation Integration

**File:** `src/components/dashboard-nav.tsx`

Added "Activity Logs" tab with Activity icon to main navigation:
- Desktop: Horizontal tab bar
- Mobile: Slide-out menu
- Positioned between Backups and Notifications

**File:** `src/routes/dashboard.tsx`

Integrated ActivityLogList component into dashboard routing

## UI Design

The Activity Logs UI follows the existing design system:

### Colors & Badges
```typescript
Info:    Blue badge, Info icon
Success: Green badge, CheckCircle2 icon
Warning: Yellow badge, AlertTriangle icon
Error:   Red badge, AlertCircle icon
```

### Layout
```
┌─────────────────────────────────────────────────┐
│ Activity Logs                    [Refresh]      │
│ Monitor all system activities and events        │
├─────────────────────────────────────────────────┤
│ Filters                                         │
│ [Log Level ▼] [Entity Type ▼] [Per Page ▼]    │
├─────────────────────────────────────────────────┤
│ Showing 1 to 50 of 237 logs                    │
├─────────────────────────────────────────────────┤
│ ✓ Database Created                   [Success] │
│   Database configuration 'Production DB' created│
│   📅 Nov 19, 2025 10:30 AM  💾 Production DB   │
│   👤 admin  🌐 192.168.1.100                   │
├─────────────────────────────────────────────────┤
│ ⚠ Backup Failed                      [Error]   │
│   Backup failed: Connection timeout            │
│   📅 Nov 19, 2025 10:15 AM  💾 Staging DB      │
├─────────────────────────────────────────────────┤
│ Page 1 of 5          [← Previous] [Next →]    │
└─────────────────────────────────────────────────┘
```

## Action Labels

Human-friendly labels for all actions:

| Action                  | Label              |
|------------------------|---------------------|
| login                  | User Login          |
| storage_created        | Storage Created     |
| database_created       | Database Created    |
| database_paused        | Database Paused     |
| database_unpaused      | Database Resumed    |
| backup_triggered       | Backup Triggered    |
| backup_completed       | Backup Completed    |
| backup_failed          | Backup Failed       |
| system_startup         | System Startup      |
| system_shutdown        | System Shutdown     |
| (and 15 more...)       |                     |

## Usage Examples

### View Recent Logs
1. Navigate to Dashboard
2. Click "Activity Logs" tab
3. See the most recent 50 logs

### Filter by Error Level
1. Click "Log Level" dropdown
2. Select "Error"
3. View only error logs

### Filter by Entity Type
1. Click "Entity Type" dropdown
2. Select "Database"
3. View only database-related activities

### Change Page Size
1. Click "Results Per Page" dropdown
2. Select 100
3. View 100 logs per page

### Navigate Pages
1. Scroll to bottom
2. Click "Next" to view older logs
3. Click "Previous" to go back

## Technical Features

### Performance
- React Query caching for fast repeated views
- Lazy loading with pagination
- Debounced filter changes
- Optimized re-renders

### Accessibility
- Semantic HTML structure
- ARIA labels for screen readers
- Keyboard navigation support
- Focus management

### Responsive Design
- Mobile-first approach
- Breakpoints: sm, md, lg
- Touch-friendly tap targets
- Collapsible filters on mobile

## Integration with Backend

The UI communicates with these API endpoints:

```
GET /api/v1/logs
  ?level=error
  &entity_type=database
  &limit=50
  &offset=0

GET /api/v1/logs/{id}
```

Response structure matches the TypeScript types defined in `api.ts`.

## Future Enhancements

Potential improvements:
- Date range picker for custom time periods
- Export logs to CSV/JSON
- Real-time WebSocket updates (instead of polling)
- Search by description text
- Bookmark/favorite specific logs
- Log detail modal with full metadata
- Bulk actions (delete, export selected)
- Dashboard widget showing recent critical logs

## Testing

To test the Activity Logs UI:

1. **View Logs**
   ```bash
   # Start the web app
   cd web
   npm run dev
   ```
   - Navigate to http://localhost:5173
   - Login
   - Click "Activity Logs" tab

2. **Generate Test Data**
   - Create/update/delete database configs
   - Trigger manual backups
   - Login/logout
   - All actions will appear in logs

3. **Test Filters**
   - Try each log level filter
   - Try each entity type filter
   - Change page size
   - Navigate between pages

4. **Test Error States**
   - Stop the backend server
   - Observe error message
   - Click "Try Again"

## Files Modified/Created

### Created
- `src/lib/api/logs.ts` - API client hooks
- `src/components/activity-log-list.tsx` - Main UI component
- `web/ACTIVITY_LOGS_UI.md` - This documentation

### Modified
- `src/lib/types/api.ts` - Added ActivityLog types
- `src/components/dashboard-nav.tsx` - Added logs tab
- `src/routes/dashboard.tsx` - Integrated ActivityLogList

## Design Consistency

The Activity Logs UI maintains consistency with existing components:
- Uses same Card, Badge, Button components
- Follows same color scheme
- Matches existing spacing and typography
- Same error and loading states
- Identical animation patterns
