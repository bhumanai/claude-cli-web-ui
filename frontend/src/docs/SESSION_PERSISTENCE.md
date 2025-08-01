# Session Persistence System

## Overview

The Claude CLI Web UI includes a comprehensive session persistence and data management system that automatically saves and restores user data across browser sessions. This system provides robust data handling, corruption recovery, cross-tab synchronization, and user preference management.

## Architecture

The session persistence system consists of several layers:

1. **SessionStorageService** - Core storage service with data validation and migration
2. **Persistence Hooks** - React hooks for easy integration with components
3. **Data Management UI** - User interface for backup, restore, and cleanup operations
4. **Session Restoration** - Automated loading states and error recovery

## Core Components

### SessionStorageService

The central service that manages all localStorage operations with advanced features:

- **Data Validation**: Ensures data integrity with schema validation
- **Versioning & Migration**: Automatic schema migration between versions
- **Corruption Recovery**: Graceful handling of corrupted data
- **Size Management**: Automatic cleanup and memory optimization
- **Cross-tab Sync**: Synchronization between multiple browser tabs

```typescript
import SessionStorageService from '../services/SessionStorageService'

const service = SessionStorageService.getInstance()
await service.initialize()

// Save user preferences
service.savePreferences({ theme: 'dark', fontSize: 'medium' })

// Get command history
const history = service.getCommandHistory()
```

### Persistence Hooks

#### useSessionPersistence

Core hook providing access to all persistence operations:

```typescript
import { useSessionPersistence } from '../hooks/useSessionPersistence'

const {
  isRestoring,
  isInitialized,
  saveCommandHistory,
  loadCommandHistory,
  savePreferences,
  loadPreferences,
  createBackup,
  restoreFromBackup
} = useSessionPersistence()
```

#### useUserPreferences

Specialized hook for user preference management:

```typescript
import { useUserPreferences } from '../hooks/useUserPreferences'

const {
  preferences,
  setTheme,
  toggleNotifications,
  resetToDefaults
} = useUserPreferences()
```

#### useViewState

Hook for UI layout and view state persistence:

```typescript
import { useViewState } from '../hooks/useViewState'

const {
  viewState,
  setActiveView,
  toggleSidebar,
  applyLayoutPreset
} = useViewState()
```

#### Enhanced useCommandHistory

Backward-compatible command history with persistence integration:

```typescript
import { useCommandHistory } from '../hooks/useCommandHistory'

const {
  history,
  addCommand,
  getPreviousCommand,
  searchHistory,
  exportHistory
} = useCommandHistory()
```

## Data Types

### Session Data
```typescript
interface SessionData {
  sessionId: string
  lastActivity: string
  version: string
  created: string
  deviceInfo?: {
    userAgent: string
    language: string
    timezone: string
  }
}
```

### User Preferences
```typescript
interface UserPreferences {
  theme: 'light' | 'dark'
  fontSize: 'small' | 'medium' | 'large'
  commandSuggestions: boolean
  autoSave: boolean
  notifications: boolean
  soundEnabled: boolean
  animationsEnabled: boolean
  compactMode: boolean
  showTimestamps: boolean
  maxHistoryItems: number
}
```

### View State
```typescript
interface ViewState {
  activeView: 'terminal' | 'tasks'
  sidebarCollapsed: boolean
  terminalHeight: number
  splitViewEnabled: boolean
  activeTab: string
  scrollPosition: number
  filters: Record<string, any>
  sortSettings: Record<string, any>
}
```

## Features

### Automatic Session Persistence

- **Command History**: Last 100 commands with output (truncated for size)
- **User Preferences**: Theme, font size, feature toggles
- **View State**: Layout settings, active views, UI state
- **Session Metadata**: Device info, timestamps, version tracking

### Data Management

- **Backup & Restore**: Export/import complete session data
- **Selective Cleanup**: Clear specific data types
- **Storage Statistics**: Monitor usage and performance
- **Corruption Recovery**: Automatic detection and recovery

### Cross-tab Synchronization

- **Real-time Updates**: Changes sync across browser tabs
- **Event System**: Custom events for component updates
- **Conflict Resolution**: Last-write-wins strategy

### Memory Management

- **Size Limits**: 10MB default limit with automatic cleanup
- **Intelligent Truncation**: Keep most recent and important data
- **Garbage Collection**: Periodic cleanup of expired data

## Usage Examples

### Basic Integration

```typescript
import { SessionRestorationHandler } from '../components/SessionRestorationHandler'
import { useUserPreferences } from '../hooks/useUserPreferences'

function App() {
  return (
    <SessionRestorationHandler
      onRestoreComplete={(data) => console.log('Session restored:', data)}
      onRestoreError={(error) => console.error('Restoration failed:', error)}
    >
      <YourAppComponents />
    </SessionRestorationHandler>
  )
}

function Settings() {
  const { preferences, setTheme, toggleNotifications } = useUserPreferences()
  
  return (
    <div>
      <button onClick={() => setTheme('light')}>
        Current theme: {preferences.theme}
      </button>
      <button onClick={toggleNotifications}>
        Notifications: {preferences.notifications ? 'On' : 'Off'}
      </button>
    </div>
  )
}
```

### Data Management UI

```typescript
import { DataManagementPanel } from '../components/DataManagementPanel'

function App() {
  const [showDataPanel, setShowDataPanel] = useState(false)
  
  return (
    <div>
      <button onClick={() => setShowDataPanel(true)}>
        Manage Data
      </button>
      
      <DataManagementPanel
        isOpen={showDataPanel}
        onClose={() => setShowDataPanel(false)}
      />
    </div>
  )
}
```

### Command History with Persistence

```typescript
function Terminal() {
  const { 
    history, 
    addCommand, 
    getPreviousCommand, 
    searchHistory 
  } = useCommandHistory()
  
  const handleCommand = (cmd: string) => {
    addCommand(cmd) // Automatically persisted
  }
  
  const handleUpArrow = () => {
    const prev = getPreviousCommand()
    // Use previous command
  }
}
```

## Configuration

### Storage Limits

```typescript
export const STORAGE_CONFIG = {
  MAX_COMMAND_HISTORY: 100,
  MAX_OUTPUT_LENGTH: 2000,
  SESSION_EXPIRY_HOURS: 24,
  AUTO_SAVE_INTERVAL: 30000,
  MAX_STORAGE_SIZE_MB: 10,
  BACKUP_RETENTION_DAYS: 7,
  CROSS_TAB_SYNC_INTERVAL: 5000
}
```

### Storage Keys

All data is stored with versioned keys to support migration:

```typescript
export const STORAGE_KEYS = {
  SESSION: 'claude-cli-session-v1.2',
  COMMAND_HISTORY: 'claude-cli-command-history-v1.2',
  USER_PREFERENCES: 'claude-cli-preferences-v1.2',
  VIEW_STATE: 'claude-cli-view-state-v1.2',
  BACKUP: 'claude-cli-backup-v1.2',
  SCHEMA_VERSION: 'claude-cli-schema-version'
}
```

## Migration System

The system supports automatic data migration between versions:

```typescript
const migrations: Record<string, (data: any) => any> = {
  '1.0.0': (data) => ({
    ...data,
    version: '1.1.0',
    preferences: { ...data.preferences, animationsEnabled: true }
  }),
  '1.1.0': (data) => ({
    ...data,
    version: '1.2.0',
    preferences: { ...data.preferences, maxHistoryItems: 100 }
  })
}
```

## Error Handling

### Corruption Recovery

The system automatically detects and recovers from data corruption:

1. **Validation**: Each data type has schema validation
2. **Fallback**: Falls back to defaults for invalid data
3. **Migration**: Attempts to migrate from older formats
4. **User Notification**: Informs users of recovery actions

### Storage Failures

- **Quota Exceeded**: Automatic cleanup and retry
- **Unavailable Storage**: Graceful degradation to memory-only
- **Permission Denied**: Fallback to session storage

## Performance Considerations

### Optimization Strategies

- **Throttled Saves**: Automatic saving limited to prevent excessive writes
- **Selective Persistence**: Only save changed data
- **Compression**: Large data is compressed before storage
- **Lazy Loading**: Data loaded only when needed

### Memory Usage

- **Size Monitoring**: Continuous monitoring of storage usage
- **Automatic Cleanup**: Removes old or unnecessary data
- **User Control**: Manual cleanup options in UI

## Security Considerations

### Data Protection

- **Sensitive Data**: Command outputs are truncated to prevent sensitive data persistence
- **Local Only**: All data stored locally, never transmitted
- **User Control**: Complete user control over data lifecycle

### Privacy

- **No Tracking**: No analytics or tracking of user commands
- **Opt-out**: Users can disable persistence features
- **Clear Options**: Easy data clearing and export

## Testing

The system includes comprehensive tests:

- **Unit Tests**: All service methods and hooks
- **Integration Tests**: Cross-component data flow
- **Migration Tests**: Version upgrade scenarios
- **Error Handling**: Corruption and failure scenarios

Run tests with:
```bash
npm test -- SessionStorageService
npm test -- useSessionPersistence
npm test -- useUserPreferences
```

## Troubleshooting

### Common Issues

1. **Data Not Persisting**
   - Check localStorage quota
   - Verify initialization completion
   - Look for console errors

2. **Migration Failures**
   - Clear all data and restart
   - Check for schema validation errors
   - Verify version compatibility

3. **Performance Issues**
   - Check storage size limits
   - Enable automatic cleanup
   - Reduce history retention

### Debugging

Enable debug logging:
```typescript
localStorage.setItem('claude-cli-debug', 'true')
```

Check storage statistics:
```typescript
const service = SessionStorageService.getInstance()
const stats = service.getStorageStats()
console.log('Storage stats:', stats)
```

## Future Enhancements

- **Cloud Sync**: Optional cloud synchronization
- **Encryption**: Local data encryption options
- **Compression**: Better compression algorithms
- **Analytics**: Usage analytics (opt-in)
- **Export Formats**: Additional export formats (CSV, XML)

---

For more information, see the source code in:
- `/services/SessionStorageService.ts`
- `/hooks/useSessionPersistence.ts`
- `/hooks/useUserPreferences.ts`
- `/hooks/useViewState.ts`
- `/components/DataManagementPanel.tsx`
- `/components/SessionRestorationHandler.tsx`