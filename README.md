# Logseq Calendar Sync Plugin

A Logseq plugin that syncs your calendar events from ICS files directly into your daily journal pages.

## Features

- 🔄 Sync calendar events from up to 4 ICS URLs
- 📅 Automatically adds events under a "Daily Plan" section (customizable)
- ⏰ Support for both all-day and timed events
- 🔁 Auto-sync when new journal pages are created
- ⚡ Manual sync via command palette
- ⏱️ Optional scheduled sync at custom intervals
- 🛡️ Safe mode to strikethrough removed events instead of deleting them
- 🔗 Preserves event blocks that have references or children

## Installation

1. Open Logseq
2. Go to Settings > Features > Enable Plugin System
3. Go to Plugins > Marketplace
4. Search for "Calendar Sync"
5. Click Install

## Configuration

The plugin can be configured through the plugin settings:

- **Target Block Header**: The header under which events will be added (default: "### Daily Plan")
- **Safe Mode**: When enabled, removed events are struck through instead of deleted
- **Auto-sync on New Journal Pages**: Automatically sync when new journal pages are created
- **Enable Scheduled Sync**: Enable automatic syncing at regular intervals
- **Sync Interval**: How often to sync (in minutes) when scheduled sync is enabled
- **ICS URL 1-4**: URLs to your ICS calendar files (supports up to 4 calendars)

## Usage

### Initial Setup

1. Add your ICS calendar URL(s) in the plugin settings
2. Create a "### Daily Plan" section in your journal template (or customize the header in settings)
3. Click the "Sync Calendar" button in the command palette (cmd/ctrl + shift + p)
4. Go into Settings > custom.edn and modify the following setting to hide the ics-uid property:

```
 ;; Hide specific block properties.
 ;; Example usage:
 ;; :block-hidden-properties #{:public :icon}
 :block-hidden-properties #{:ics-uid}
```

### Features

- Events are automatically sorted by time
- All-day events appear at the top
- Events are formatted as: `📅 HH:MM - HH:MM: Event Name` or `📅 All Day: Event Name`
- Referenced events are preserved during sync
- Events with children blocks are preserved
- Safe mode prevents accidental deletion of events

### Manual Sync

You can manually sync your calendar at any time by:
1. Opening the command palette (cmd/ctrl + shift + p)
2. Searching for "Sync Calendar"
3. Pressing Enter

## License

MIT

## Support

If you encounter any issues or have feature requests, please file them in the GitHub issues section.