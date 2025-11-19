# Recent Activity Widget - System Overview

## Overview

Added a "Recent Activity" widget to the System Overview page that displays the last 10 activity logs, providing quick visibility into recent system events without navigating to the dedicated Activity Logs page.

## Implementation

### Component Created

**File:** `web/src/components/recent-activity.tsx`

A compact, read-only widget that shows recent activity logs with:

- **Last 10 Events**: Displays the 10 most recent activity logs
- **Auto-Refresh**: Updates every 30 seconds (inherited from useActivityLogs hook)
- **Visual Indicators**: Color-coded icons and badges for different log levels
- **Compact Layout**: Optimized for dashboard overview display
- **View All Button**: Quick navigation to full Activity Logs page

### Features

#### 1. Visual Design

Each activity log entry shows:
- **Level-specific icon**: Info (ℹ️), Success (✅), Warning (⚠️), Error (❌)
- **Action label**: Human-readable action name
- **Badge**: Color-coded level badge
- **Description**: Brief description of what happened
- **Metadata**: Timestamp, entity name, and username

#### 2. Log Levels

```typescript
const levelConfig = {
  info: {
    icon: Info,
    variant: "secondary",
    color: "text-blue-600",
  },
  success: {
    icon: CheckCircle2,
    variant: "default",
    color: "text-green-600",
  },
  warning: {
    icon: AlertTriangle,
    variant: "outline",
    color: "text-yellow-600",
  },
  error: {
    icon: AlertCircle,
    variant: "destructive",
    color: "text-red-600",
  },
};
```

#### 3. Action Labels

All 20+ action types have human-readable labels:
- `login` → "User Login"
- `database_created` → "Database Created"
- `backup_triggered` → "Backup Triggered"
- `backup_completed` → "Backup Completed"
- `backup_failed` → "Backup Failed"
- `system_startup` → "System Startup"
- etc.

### Integration

**File:** `web/src/routes/dashboard.tsx` (lines 7, 185-188)

Added to the System Overview section, appearing after the Performance Metrics:

```tsx
{/* Recent Activity Section */}
<div>
  <RecentActivity onViewAll={() => setCurrentTab("logs")} />
</div>
```

The `onViewAll` callback switches to the "logs" tab when the "View All" button is clicked.

## UI Layout

### System Overview Page Structure

```
┌─────────────────────────────────────────────────┐
│ System Overview                                 │
├─────────────────────────────────────────────────┤
│ [Total Databases] [Backups 24h] [Storage Used] │
├─────────────────────────────────────────────────┤
│ Performance Metrics                             │
├─────────────────────────────────────────────────┤
│ [Success Rate]    [Failure Rate]                │
├─────────────────────────────────────────────────┤
│ Recent Activity                 [View All →]    │
├─────────────────────────────────────────────────┤
│ ✅ Backup Completed               [success]     │
│    Backup swift-falcon-20251119 completed       │
│    📅 Nov 19, 2025 • Production DB • admin      │
├─────────────────────────────────────────────────┤
│ 🔵 Database Created                [info]       │
│    Database 'Staging DB' created                │
│    📅 Nov 19, 2025 • Staging DB • admin         │
├─────────────────────────────────────────────────┤
│ ⚠️  Backup Failed                  [error]      │
│    Backup failed: Connection timeout            │
│    📅 Nov 19, 2025 • Test DB • admin            │
├─────────────────────────────────────────────────┤
│ ... (7 more entries)                            │
└─────────────────────────────────────────────────┘
```

### Compact Entry Format

```
┌──────────────────────────────────────────────────┐
│ [Icon] Action Label                    [Badge]   │
│        Description text                          │
│        Timestamp • Entity • User                 │
└──────────────────────────────────────────────────┘
```

## Features

### 1. Auto-Refresh

The widget automatically refreshes every 30 seconds, ensuring users always see the latest activity without manual refresh.

### 2. Error Handling

If activity logs fail to load, the widget displays:
- Error icon (❌)
- "Failed to Load Activity" title
- Error message
- Maintains card layout consistency

### 3. Empty State

When no logs exist yet:
- Shows activity icon
- "No activity logs yet" message
- Clean, centered layout

### 4. Loading State

While fetching data:
- Shows 5 skeleton loaders
- Maintains card structure
- Smooth loading animation

### 5. Quick Navigation

The "View All" button:
- Positioned in the card header
- Includes right arrow icon (→)
- Switches to the full Activity Logs tab
- Maintains context (stays on dashboard)

## User Experience

### Benefits

1. **Quick Visibility**: See recent activity at a glance without navigation
2. **Real-time Updates**: Auto-refresh keeps information current
3. **Context Awareness**: Shows entity names and usernames for clarity
4. **Action-oriented**: "View All" button for detailed exploration
5. **Non-intrusive**: Compact design doesn't overwhelm the overview

### Use Cases

1. **System Monitoring**: Quick check of recent system events
2. **Troubleshooting**: Spot recent errors or failures immediately
3. **Activity Verification**: Confirm recent actions completed successfully
4. **Audit Trail**: Quick glimpse of who did what and when
5. **Status Updates**: See backup completions and system events

## Technical Details

### API Integration

Uses the existing `useActivityLogs` hook:

```typescript
const { data, isLoading, error } = useActivityLogs({ limit: 10 });
```

- Fetches last 10 logs
- 30-second auto-refresh interval
- Cached with React Query
- Shared cache with full Activity Logs page

### Performance

- **Lightweight**: Only fetches 10 records
- **Cached**: Shares cache with Activity Logs page
- **Optimized**: Uses line-clamp for long descriptions
- **Responsive**: Adapts to mobile/tablet/desktop

### Accessibility

- Semantic HTML structure
- ARIA labels for icons
- Keyboard navigation support
- Screen reader friendly
- Color + icon for status (not color alone)

## Files Modified/Created

### Created
- `web/src/components/recent-activity.tsx` - Recent Activity widget component

### Modified
- `web/src/routes/dashboard.tsx` - Added RecentActivity to overview section

## Testing

### Verify Recent Activity Widget

1. **Start the application**:
   ```bash
   cd web
   npm run dev
   ```

2. **Navigate to Dashboard** (System Overview tab)

3. **Verify the widget appears** below Performance Metrics

4. **Check display**:
   - Shows up to 10 recent logs
   - Each log has icon, action label, badge, description, and metadata
   - "View All" button in header

5. **Test "View All" button**:
   - Click "View All"
   - Should switch to Activity Logs tab
   - Should show full activity log list

6. **Test auto-refresh**:
   - Trigger an action (create database, trigger backup, etc.)
   - Wait up to 30 seconds
   - New activity should appear in the widget

7. **Test error state**:
   - Stop the backend server
   - Widget should show error message
   - Restart server and it should recover

8. **Test empty state**:
   - Fresh database with no logs
   - Should show "No activity logs yet" message

## Future Enhancements

Potential improvements:

1. **Filtering**: Add level filter (show only errors/warnings)
2. **Expandable Entries**: Click to see full details in a popover
3. **Real-time Updates**: Use WebSocket instead of polling
4. **Configurable Limit**: Let users choose 5/10/20 logs
5. **Time Range Filter**: Last hour/day/week selector
6. **Export**: Download recent activity as CSV
7. **Pinning**: Pin important logs to keep them visible
8. **Notifications**: Badge count of new activities since last view

## Summary

The Recent Activity widget provides instant visibility into system events directly on the overview page. Users no longer need to navigate to the Activity Logs tab for a quick check of recent activity. The compact, auto-refreshing design keeps stakeholders informed without overwhelming the dashboard.

Perfect for:
- Quick status checks
- Recent error detection
- Activity verification
- System health monitoring
- Audit trail overview
