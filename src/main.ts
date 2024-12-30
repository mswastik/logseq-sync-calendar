import '@logseq/libs';
import { 
  BlockEntity,
  SettingSchemaDesc,
  PageEntity
} from '@logseq/libs/dist/LSPlugin.user';
import ICAL from 'ical.js';

const LOG_MESSAGES = {
  SKIPPING_REFERENCES: (content: string, count: number) => 
    `⏩ Skipping block with references: ${content}\n- References found in ${count - 1} other blocks`,
  KEEPING_BLOCK: (reasons: string[]) => 
    `⏩ Keeping block because:${reasons.join('')}`,
  STRIKING_THROUGH: (content: string) => 
    `✏️ Striking through removed calendar event: ${content}`,
  DELETING_EVENT: (content: string) => 
    `🗑️ Deleting removed calendar event: ${content}`,
} as const;

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
  uid: string;
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

// Add this utility function to clean markdown formatting
function cleanMarkdownFormatting(text: string): string {
  // Handle strikethrough
  if (text.startsWith('~~') && text.endsWith('~~')) {
    text = text.slice(2, -2);
  }
  
  // Handle bold
  if (text.startsWith('**') && text.endsWith('**')) {
    text = text.slice(2, -2);
  }
  
  // Handle italic
  if ((text.startsWith('*') && text.endsWith('*')) || 
      (text.startsWith('_') && text.endsWith('_'))) {
    text = text.slice(1, -1);
  }
  
  // Handle highlight
  if (text.startsWith('==') && text.endsWith('==')) {
    text = text.slice(2, -2);
  }
  
  return text;
}

// Update isCalendarEvent to use the new function
function isCalendarEvent(content: string): boolean {
  const { cleanContent } = getFirstLineContent(content);
  
  console.log('Checking if calendar event:', {
    content,
    cleanContent,
    safeMode: logseq.settings?.safeMode,
    result: cleanContent.startsWith('📅')
  });
  
  return cleanContent.startsWith('📅');
}

// Update getEventSortKey to use the new function
function getEventSortKey(content: string): { isAllDay: boolean; time: string; name: string } {
  const { cleanContent } = getFirstLineContent(content);

  const isAllDay = isAllDayEvent(cleanContent);
  let time = '';
  let name = '';

  if (isAllDay) {
    name = normalizeEventName(cleanContent.split('All Day:')[1]);
  } else {
    const match = cleanContent.match(/📅 (\d{4}) - (\d{4}): (.+)/);
    if (match) {
      time = match[1];
      name = normalizeEventName(match[3]);
    }
  }

  return { isAllDay, time, name };
}

// Update compareEvents to handle markdown in struck-through check
function compareEvents(a: string, b: string): number {
  const { firstLine: aFirstLine, cleanContent: aClean } = getFirstLineContent(a);
  const { firstLine: bFirstLine, cleanContent: bClean } = getFirstLineContent(b);
  
  // Get sort keys using cleaned content
  const aKey = getEventSortKey(aClean);
  const bKey = getEventSortKey(bClean);
  
  // Normal sorting based on event type and time
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
    const uid = vevent.uid;

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
          uid
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
        uid
      });
    }
  }

  return eventMap;
}

async function addNewEvents(eventMap: Map<string, { pageName: string; content: string; uid: string }>, targetHeader: string) {
  const eventsByPage = Array.from(eventMap.values()).reduce((acc, { pageName, content, uid }) => {
    if (!acc[pageName]) acc[pageName] = [];
    acc[pageName].push({ content, uid });
    return acc;
  }, {} as Record<string, Array<{ content: string; uid: string }>>);

  for (const [pageName, events] of Object.entries(eventsByPage)) {
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
    const sortedEvents = sortCalendarEvents(events.map(e => e.content));

    // Create new blocks for events that don't exist
    for (const eventContent of sortedEvents) {
      console.log(`Checking event: ${eventContent}`);
      
      // Find the corresponding event with UID
      const event = events.find(e => e.content === eventContent);
      if (!event) continue;

      // Check if any existing block has this UID
      const existingBlocks = await Promise.all((targetBlock.children || []).map(async (child: any) => {
        const uuid = 'uuid' in child ? child.uuid : child[1];
        const block = await logseq.Editor.getBlock(uuid);
        if (!block) return null;
        
        // Get the block's ics-uid property
        const blockUid = await logseq.Editor.getBlockProperty(block.uuid, 'ics-uid');
        
        return {
          block,
          matches: blockUid === event.uid
        };
      }));

      // Filter out null values and find matching block
      const matchingBlock = existingBlocks
        .filter((result): result is {block: BlockEntity; matches: boolean} => result !== null)
        .find(result => result.matches);

      if (!matchingBlock) {
        console.log(`Creating new block for event: ${eventContent}`);
        try {
          const newBlock = await logseq.Editor.insertBlock(
            targetBlock.uuid,
            eventContent,
            { sibling: false }
          );

          // Add the UID as a block property with additional error handling
          if (newBlock && newBlock.uuid) {
            console.log(`Setting ics-uid property for block ${newBlock.uuid}: ${event.uid}`);
            try {
              await logseq.Editor.upsertBlockProperty(
                newBlock.uuid,
                'ics-uid',
                event.uid
              );
            } catch (error) {
              console.error('Failed to set ics-uid property:', error);
            }
          } else {
            console.warn('New block creation failed or block has no UUID');
          }
        } catch (error) {
          console.error('Failed to create new block:', error);
        }
      } else {
        // If the content has changed but UID matches, update the content
        if (normalizeEventName(matchingBlock.block.content.split('\n')[0]) !== normalizeEventName(eventContent)) {
          console.log(`Updating existing block content for event with UID ${event.uid}`);
          await logseq.Editor.updateBlock(matchingBlock.block.uuid, eventContent);
        } else {
          console.log(`Event already exists with UID: ${event.uid}`);
        }
      }
    }
  }
}

async function deleteEvents(targetBlock: BlockEntity, eventMap: Map<string, CalendarEvent>) {
  console.log('\nChecking blocks for deletion...');
  
  const updatedTargetBlock = await logseq.Editor.getBlock(targetBlock.uuid) as BlockEntity;
  if (!updatedTargetBlock) {
    console.log('Could not fetch Target block');
    return;
  }

  const childBlocks = await getChildBlocks(updatedTargetBlock);
  
  // Create a set of UIDs from the eventMap for faster lookup
  const validUids = new Set(Array.from(eventMap.values()).map(event => event.uid));

  for (const block of childBlocks) {
    if (!block || !isCalendarEvent(block.content)) continue;
    
    // Get the block's ics-uid property
    const blockUid = await logseq.Editor.getBlockProperty(block.uuid, 'ics-uid');
    
    // If block has no UID or UID is not in current ICS data
    if (!blockUid || !validUids.has(blockUid)) {
      // Check for references/embeds
      const query = `[:find (pull ?b [*])
                     :where
                     [?b :block/content ?content]
                     [(clojure.string/includes? ?content "${block.uuid}")]]`;
      
      const results = await logseq.DB.datascriptQuery(query);
      const hasReferences = results && results.length > 1;
      
      // Check for children
      const hasChildren = (block.children || []).length > 0;

      if (!hasChildren && !hasReferences) {
        const content = block.content;
        if (logseq.settings?.safeMode) {
          console.log(LOG_MESSAGES.STRIKING_THROUGH(content));
          // Get first line and rest of content
          const [firstLine, ...rest] = content.split('\n');
          // Only strikethrough the first line if it isn't already
          const newFirstLine = firstLine.startsWith('~~') ? firstLine : `~~${firstLine}~~`;
          const newContent = [newFirstLine, ...rest].join('\n');
          await logseq.Editor.updateBlock(block.uuid, newContent);
        } else {
          console.log(LOG_MESSAGES.DELETING_EVENT(content));
          await logseq.Editor.removeBlock(block.uuid);
        }
      } else {
        const reasons = [];
        if (hasChildren) reasons.push(' has children');
        if (hasReferences) reasons.push(' has references');
        console.log(LOG_MESSAGES.KEEPING_BLOCK(reasons));
      }
    }
  }
}

async function reorderEvents(targetBlock: BlockEntity) {
  console.log('\nReordering blocks...');
  
  const updatedTargetBlock = await logseq.Editor.getBlock(targetBlock.uuid) as BlockEntity;
  if (!updatedTargetBlock) {
    console.log('Could not fetch updated Target block');
    return;
  }

  const childBlocks = await getChildBlocks(updatedTargetBlock);
  console.log('All child blocks:', childBlocks.map(b => ({
    content: b?.content,
    uuid: b?.uuid
  })));

  // Filter calendar events and sort them
  const calendarBlocks = childBlocks
    .filter(block => {
      const isCalendar = block && isCalendarEvent(block.content);
      console.log('Filtering block:', {
        content: block?.content,
        isCalendarEvent: isCalendar
      });
      return block && isCalendar;
    })
    .sort((a, b) => {
      if (!a || !b) return 0;
      const result = compareEvents(a.content, b.content);
      console.log('Comparing blocks:', {
        a: a.content,
        b: b.content,
        result
      });
      return result;
    });

  console.log('Calendar blocks after filtering:', calendarBlocks.map(b => ({
    content: b?.content,
    uuid: b?.uuid
  })));

  // Reorder blocks
  for (let i = calendarBlocks.length - 1; i >= 0; i--) {
    const block = calendarBlocks[i];
    if (!block) continue;
    
    console.log(`Moving block: ${block.content} (UUID: ${block.uuid})`);
    
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
    if (i < calendarBlocks.length - 1) {
      const currentSibling = await logseq.Editor.getNextSiblingBlock(block.uuid);
      if (currentSibling) {
        console.log(`Moving before sibling: ${currentSibling.content} (UUID: ${currentSibling.uuid})`);
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

function normalizeEventName(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

// 1. Add utility function for finding target block
function findDailyPlanBlock(blocks: BlockEntity[], targetHeader: string): BlockEntity | undefined {
  return blocks.find((block: BlockEntity) => 
    normalizeEventName(block.content) === normalizeEventName(targetHeader)
  );
}

// Add this utility function
function getFirstLineContent(content: string): { firstLine: string; cleanContent: string } {
  const firstLine = content.split('\n')[0];
  const cleanContent = cleanMarkdownFormatting(firstLine);
  return { firstLine, cleanContent };
}

// Add this utility function
async function getBlockWithUid(block: BlockEntity): Promise<{ block: BlockEntity; uid: string | null }> {
  const uid = await logseq.Editor.getBlockProperty(block.uuid, 'ics-uid');
  return { block, uid };
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
      await deleteEvents(targetBlock, eventMap);
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
