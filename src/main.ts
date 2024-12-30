import '@logseq/libs';
import { 
  BlockEntity,
  SettingSchemaDesc,
  PageEntity
} from '@logseq/libs/dist/LSPlugin.user';
import ICAL from 'ical.js';

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'targetBlock',
    type: 'string',
    default: '### Daily Plan',
    description: 'Header block to search for',
    title: 'Target Block Header',
  },
  {
    key: 'safeMode',
    type: 'boolean',
    default: true,
    description: 'Enable safe mode to strikethrough events instead of deleting',
    title: 'Safe Mode',
  },
  {
    key: 'autoSync',
    type: 'boolean',
    default: true,
    description: 'Automatically sync calendar when new journal pages are created',
    title: 'Auto-sync on New Journal Pages',
  },
  {
    key: 'enableScheduledSync',
    type: 'boolean',
    default: false,
    description: 'Enable automatic calendar sync at scheduled intervals',
    title: 'Enable Scheduled Sync',
  },
  {
    key: 'syncInterval',
    type: 'number',
    default: 30,
    description: 'How often to sync calendar (in minutes)',
    title: 'Sync Interval',
  },
  {
    key: 'icsUrl1',
    type: 'string',
    default: '',
    description: 'First ICS file URL',
    title: 'ICS URL 1',
  },
  {
    key: 'icsUrl2',
    type: 'string',
    default: '',
    description: 'Second ICS file URL',
    title: 'ICS URL 2',
  },
  {
    key: 'icsUrl3',
    type: 'string',
    default: '',
    description: 'Third ICS file URL',
    title: 'ICS URL 3',
  },
  {
    key: 'icsUrl4',
    type: 'string',
    default: '',
    description: 'Fourth ICS file URL',
    title: 'ICS URL 4',
  }
];

function getOriginalNameForDate(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();

  const ordinalSuffix = (n: number) =>
    ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10];
  const dayWithSuffix = `${day}${ordinalSuffix(day)}`;

  return `${month} ${dayWithSuffix}, ${year}`;
}

async function fetchICSData(url: string): Promise<ICAL.Component | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    const data = await response.text();

    const parsedData = ICAL.parse(data) as any[];
    return new ICAL.Component(parsedData);
  } catch (error) {
    console.error(`Error fetching ICS data from ${url}:`, error);
    return null;
  }
}

interface CalendarEvent {
  pageName: string;
  content: string;
}

function isAllDayEvent(content: string): boolean {
  return content.includes('All Day');
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).replace(':', '');
}

// Add this utility function
function getEventSortKey(content: string): { isAllDay: boolean; time: string; name: string } {
  const isAllDay = isAllDayEvent(content);
  let time = '';
  let name = '';

  if (isAllDay) {
    name = normalizeEventName(content.split('All Day:')[1]);
  } else {
    const match = content.match(/📅 (\d{4}) - (\d{4}): (.+)/);
    if (match) {
      time = match[1];
      name = normalizeEventName(match[3]);
    }
  }

  return { isAllDay, time, name };
}

// Then simplify compareEvents to use this
function compareEvents(a: string, b: string): number {
  const aKey = getEventSortKey(a);
  const bKey = getEventSortKey(b);
  
  if (aKey.isAllDay !== bKey.isAllDay) {
    return aKey.isAllDay ? -1 : 1;
  }
  
  if (aKey.time !== bKey.time) {
    return aKey.time.localeCompare(bKey.time);
  }
  
  return aKey.name.localeCompare(bKey.name);
}

async function processICSEvents(icsData: ICAL.Component): Promise<Map<string, CalendarEvent>> {
  const eventMap = new Map<string, CalendarEvent>();
  const events = icsData.getAllSubcomponents('vevent');

  for (const event of events) {
    const vevent = new ICAL.Event(event);

    if (vevent.startDate.isDate && vevent.endDate.isDate) {
      console.log(`Processing multi-day all-day event: ${vevent.summary}`);
      let currentDate = vevent.startDate.clone();
      const endDate = vevent.endDate.clone();

      while (currentDate.compare(endDate) <= 0) {
        const dayOriginalName = getOriginalNameForDate(currentDate.toJSDate());
        const eventContent = `📅 All Day: ${vevent.summary || 'No Title'}`;

        console.log(`Adding event for date: ${dayOriginalName} -> ${eventContent}`);
        eventMap.set(`${dayOriginalName}-${eventContent}`, {
          pageName: dayOriginalName,
          content: eventContent,
        });

        currentDate.addDuration(ICAL.Duration.fromString('P1D'));
      }
    } else {
      const summary = vevent.summary || 'No Title';
      const startTime = formatTime(vevent.startDate.toJSDate());
      const endTime = vevent.endDate ? formatTime(vevent.endDate.toJSDate()) : '????';

      const eventContent = vevent.startDate.isDate
        ? `📅 All Day: ${summary}`
        : `📅 ${startTime} - ${endTime}: ${summary}`;
      const originalName = getOriginalNameForDate(vevent.startDate.toJSDate());

      console.log(`Adding single-day event: ${eventContent} -> Page: ${originalName}`);
      eventMap.set(`${originalName}-${eventContent}`, {
        pageName: originalName,
        content: eventContent,
      });
    }
  }

  return eventMap;
}

async function addNewEvents(eventMap: Map<string, { pageName: string; content: string }>, targetHeader: string) {
  const eventsByPage = Array.from(eventMap.values()).reduce((acc, { pageName, content }) => {
    if (!acc[pageName]) acc[pageName] = [];
    acc[pageName].push(content);
    return acc;
  }, {} as Record<string, string[]>);

  for (const [pageName, eventContents] of Object.entries(eventsByPage)) {
    console.log(`Processing journal page: ${pageName}`);
    const page = await logseq.Editor.getPage(pageName) as PageEntity | null;
    if (!page) {
      console.warn(`Journal page not found: ${pageName}`);
      continue;
    }

    const blocks = await logseq.Editor.getPageBlocksTree(page.name) as BlockEntity[];
    const targetBlock = findDailyPlanBlock(blocks, targetHeader);

    if (!targetBlock) {
      console.log('No target block found, skipping page');
      continue;
    }

    // Sort events
    const allDayEvents: string[] = [];
    const timedEvents: { time: string; content: string }[] = [];

    for (const eventContent of eventContents) {
      if (eventContent.includes('All Day')) {
        allDayEvents.push(eventContent);
      } else {
        const timeMatch = eventContent.match(/📅 (\d{4}) - /);
        if (timeMatch) {
          timedEvents.push({ time: timeMatch[1], content: eventContent });
        }
      }
    }

    // Sort and combine events
    const sortedEvents = sortCalendarEvents([...allDayEvents, ...timedEvents.map(event => event.content)]);

    // Create new blocks for events that don't exist
    for (const eventContent of sortedEvents) {
      console.log(`Checking event: ${eventContent}`);
      
      // Check if any existing block has this content
      const existingBlocks = (targetBlock.children || []).filter((child: any) => {
        const childContent = 'content' in child ? child.content : child[1];
        // Split content at newline to ignore any references or properties
        const cleanChildContent = childContent.split('\n')[0];
        const cleanEventContent = eventContent.split('\n')[0];
        
        console.log('Comparing contents:', {
          clean_child: cleanChildContent,
          clean_event: cleanEventContent,
          matches: normalizeEventName(cleanChildContent) === normalizeEventName(cleanEventContent)
        });
        
        return normalizeEventName(cleanChildContent) === normalizeEventName(cleanEventContent);
      });

      if (existingBlocks.length === 0) {
        console.log(`Creating new block for event: ${eventContent}`);
        await logseq.Editor.insertBlock(
          targetBlock.uuid,
          eventContent,
          { sibling: false }
        );
      } else {
        console.log(`Event already exists: ${eventContent}`);
      }
    }
  }
}

async function deleteEvents(targetBlock: BlockEntity, sortedEvents: string[]) {
  console.log('\nChecking blocks for deletion...');
  
  const updatedTargetBlock = await logseq.Editor.getBlock(targetBlock.uuid) as BlockEntity;
  if (!updatedTargetBlock) {
    console.log('Could not fetch Target block');
    return;
  }

  const childBlocks = await getChildBlocks(updatedTargetBlock);
  console.log('Current sorted events:', sortedEvents);

  for (const block of childBlocks) {
    if (!block) continue;
    
    if (isCalendarEvent(block.content)) {
      const content = block.content.trim();
      
      // Query for any blocks that reference this block
      const query = `[:find (pull ?b [*])
                     :where
                     [?b :block/content ?content]
                     [(clojure.string/includes? ?content "${block.uuid}")]]`;
      
      const results = await logseq.DB.datascriptQuery(query);
      const hasReferences = results && results.length > 1; // More than 1 because the block itself contains its UUID

      if (hasReferences) {
        console.log(`⏩ Skipping block with references: ${content}`);
        console.log(`- References found in ${results.length - 1} other blocks`);
        continue;
      }

      const isInSortedEvents = sortedEvents.some(event => {
        if (isAllDayEvent(content) && isAllDayEvent(event)) {
          const currentEventName = normalizeEventName(content.split('All Day:')[1]);
          const sortedEventName = normalizeEventName(event.split('All Day:')[1]);
          return currentEventName === sortedEventName;
        }

        // Extract time and summary from both events for comparison
        const currentMatch = content.match(/📅 (\d{4}) - (\d{4}): (.+)/);
        const sortedMatch = event.match(/📅 (\d{4}) - (\d{4}): (.+)/);
        
        if (currentMatch && sortedMatch) {
          const currentTime = currentMatch[1];
          const currentSummary = normalizeEventName(currentMatch[3]);
          const sortedTime = sortedMatch[1];
          const sortedSummary = normalizeEventName(sortedMatch[3]);
          
          return currentTime === sortedTime && currentSummary === sortedSummary;
        }
        
        return false;
      });

      const hasChildren = (block.children || []).length > 0;
      
      if (!isInSortedEvents && !hasChildren && !hasReferences) {
        if (logseq.settings?.safeMode) {
          console.log(`✏️ Striking through removed calendar event: ${content}`);
          // Split content to preserve properties
          const [eventLine, ...properties] = content.split('\n');
          const newContent = [`~~${eventLine}~~`, ...properties].join('\n');
          await logseq.Editor.updateBlock(block.uuid, newContent);
        } else {
          console.log(`🗑️ Deleting removed calendar event: ${content}`);
          await logseq.Editor.removeBlock(block.uuid);
        }
      } else {
        console.log(`⏩ Keeping block because:${isInSortedEvents ? ' in sorted events' : ''}${hasChildren ? ' has children' : ''}${hasReferences ? ' has references' : ''}`);
      }
    }
  }
}

async function reorderEvents(targetBlock: BlockEntity) {
  console.log('\nReordering blocks...');
  
  // Get fresh block data
  const updatedTargetBlock = await logseq.Editor.getBlock(targetBlock.uuid) as BlockEntity;
  if (!updatedTargetBlock) {
    console.log('Could not fetch updated Target block');
    return;
  }

  // Use utility function to get child blocks
  const childBlocks = await getChildBlocks(updatedTargetBlock);

  // Filter and sort calendar event blocks
  const calendarBlocks = childBlocks.filter(block => block && isCalendarEvent(block.content));
  const sortedBlocks = calendarBlocks.sort((a, b) => {
    if (!a || !b) return 0;
    return compareEvents(a.content, b.content);
  });

  console.log('Blocks to reorder:', sortedBlocks.map(b => b?.content));

  // Reorder blocks
  for (let i = sortedBlocks.length - 1; i >= 0; i--) {
    const block = sortedBlocks[i];
    if (!block) continue;
    
    console.log(`Moving block: ${block.content}`);
    
    // First ensure block is a child of Target block
    await logseq.Editor.moveBlock(
      block.uuid,
      targetBlock.uuid,
      {
        before: false,
        children: true
      }
    );

    // Then position it correctly among siblings
    if (i < sortedBlocks.length - 1) {
      const currentSibling = await logseq.Editor.getNextSiblingBlock(block.uuid);
      if (currentSibling) {
        console.log(`Moving before sibling: ${currentSibling.content}`);
        await logseq.Editor.moveBlock(
          block.uuid,
          currentSibling.uuid,
          { before: true }
        );
      }
    }
  }
  
  console.log('Reordering complete');
}

// Utility function for sorting events
function sortCalendarEvents(events: string[]): string[] {
  return events.sort(compareEvents);
}

// Utility function for getting child blocks
async function getChildBlocks(parentBlock: BlockEntity): Promise<BlockEntity[]> {
  const children = await Promise.all((parentBlock.children || []).map(async (child) => {
    const uuid = 'uuid' in child ? child.uuid : child[1];
    return await logseq.Editor.getBlock(uuid);
  }));
  return children.filter((block): block is BlockEntity => block !== null);
}

// Utility function for checking if a block is a calendar event
function isCalendarEvent(content: string): boolean {
  // Get the first line of content
  const firstLine = content.split('\n')[0];
  const isStruckThrough = firstLine.startsWith('~~') && firstLine.endsWith('~~');
  
  // If struck through and safe mode is off, check the content inside ~~
  if (isStruckThrough && !logseq.settings?.safeMode) {
    const innerContent = firstLine.slice(2, -2); // Remove ~~ from start and end
    return innerContent.startsWith('📅');
  }
  
  return firstLine.startsWith('📅');
}

function normalizeEventName(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

// 1. Add utility function for finding target block
function findDailyPlanBlock(blocks: BlockEntity[], targetHeader: string): BlockEntity | undefined {
  return blocks.find((block: BlockEntity) => 
    normalizeEventName(block.content) === normalizeEventName(targetHeader)
  );
}

function main() {
  console.log('Logseq plugin loaded: Sync Calendar');
  console.log(`Safe Mode is ${logseq.settings?.safeMode ? 'ON' : 'OFF'}`);
  let syncIntervalId: ReturnType<typeof setInterval> | null = null;

  // Clean up sync-calendar command and interval before registering new one
  logseq.beforeunload(async () => {
    console.log('Cleaning up plugin...');
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    await logseq.App.registerCommandPalette(
      {
        key: 'sync-calendar',
        label: 'Sync Calendar'
      },
      () => {}
    );
  });

  logseq.useSettingsSchema(settingsSchema);
  
  // Extract sync logic into a reusable function
  const syncCalendar = async () => {
    const targetHeader = (logseq.settings?.targetBlock as string) || '### Daily Plan';
    const urls: string[] = [
      logseq.settings?.icsUrl1 as string, 
      logseq.settings?.icsUrl2 as string,
      logseq.settings?.icsUrl3 as string,
      logseq.settings?.icsUrl4 as string
    ].filter(Boolean);

    if (urls.length === 0) {
      logseq.UI.showMsg('No ICS URLs configured.', 'error');
      return;
    }

    // Process ICS files and get events
    const eventMap = new Map<string, CalendarEvent>();
    let successfulFetches = 0;
    
    for (const url of urls) {
      console.log('Processing URL:', url);
      const icsData = await fetchICSData(url);
      if (icsData) {
        console.log('ICS data fetched successfully');
        const events = await processICSEvents(icsData);
        console.log('Processed events:', Array.from(events.values()));
        events.forEach((value, key) => eventMap.set(key, value));
        successfulFetches++;
      }
    }

    if (successfulFetches === 0) {
      logseq.UI.showMsg('Failed to fetch any calendar data.', 'error');
      return;
    }

    console.log('Adding new events...');
    await addNewEvents(eventMap, targetHeader);

    // Get all journal pages
    const allPages = await logseq.Editor.getAllPages() ?? [];
    const journalPages = allPages.filter(page => page?.['journal?'] || page?.journal);
    console.log(`Found ${journalPages.length} journal pages to process`);

    // Process each journal page
    for (const page of journalPages) {
      console.log(`\nProcessing page: ${page.name}`);
      
      const blocks = await logseq.Editor.getPageBlocksTree(page.name) as BlockEntity[];
      const targetBlock = findDailyPlanBlock(blocks, targetHeader);

      if (!targetBlock) {
        console.log(`Skipping page ${page.name} - no target block found`);
        continue;
      }

      // Get events for this page
      const pageEvents = Array.from(eventMap.values())
        .filter(e => normalizeEventName(e.pageName) === normalizeEventName(page.name))
        .map(e => e.content);

      console.log('Events found for page:', pageEvents);

      // Sort events using utility function
      const sortedEvents = sortCalendarEvents(pageEvents);

      console.log('Sorted events for', page.name, ':', sortedEvents);

      // Process events
      console.log('Deleting old events...');
      await deleteEvents(targetBlock, sortedEvents);
      console.log('Reordering events...');
      await reorderEvents(targetBlock);
    }

    logseq.UI.showMsg('Sync completed.');
  };

  // Update scheduler to use the sync function directly
  const updateScheduler = () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }

    if (logseq.settings?.enableScheduledSync) {
      let intervalMinutes = Number(logseq.settings?.syncInterval || 30);
      if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
        console.warn('Invalid sync interval, using default of 30 minutes');
        intervalMinutes = 30;
      }
      const interval = intervalMinutes * 60 * 1000;
      
      console.log(`Setting up scheduled sync every ${intervalMinutes} minutes`);
      syncIntervalId = setInterval(async () => {
        console.log('Running scheduled sync...');
        try {
          await syncCalendar(); // Call the sync function directly
        } catch (error) {
          console.error('Failed to run scheduled sync:', error);
          logseq.UI.showMsg('Failed to sync calendar', 'error');
        }
      }, interval);
    }
  };

  // Listen for settings changes
  logseq.onSettingsChanged(() => {
    console.log('Settings changed, updating scheduler');
    updateScheduler();
  });

  // Initial scheduler setup
  updateScheduler();

  // Register command palette to use the same sync function
  logseq.App.registerCommandPalette(
    {
      key: 'sync-calendar',
      label: 'Sync Calendar',
    },
    syncCalendar  // Use the same sync function
  );

  // Update page listener to use the same sync function
  logseq.App.onPageHeadActionsSlotted(async ({ page }) => {
    if (page.journal && logseq.settings?.autoSync !== false) {
      console.log('New journal page detected:', page.name);
      try {
        await syncCalendar();  // Use the same sync function
      } catch (error) {
        console.error('Failed to sync on new journal page:', error);
        logseq.UI.showMsg('Failed to sync calendar', 'error');
      }
    }
  });
}

logseq.ready(main).catch(console.error);
