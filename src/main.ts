import '@logseq/libs';
import { 
  BlockEntity,
  SettingSchemaDesc
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

const LOG_MESSAGES = {
  SKIPPING_REFERENCES: (content: string, count: number) => 
    `⏩ Skipping block with references: ${content}\n- References found in ${count - 1} other blocks`,
  KEEPING_BLOCK: (reasons: string[]) => 
    `⏩ Keeping block because:${reasons.join('')}`,
  STRIKING_THROUGH: (content: string) => 
    `✏️ Striking through removed calendar event: ${content}`,
  DELETING_EVENT: (content: string) => 
    `🗑️ Deleting removed calendar event: ${content}`,
  PLUGIN_LOADED: () => 
    'Logseq plugin loaded: Sync Calendar',
  SAFE_MODE_STATUS: (isOn: boolean) => 
    `Safe Mode is ${isOn ? 'ON' : 'OFF'}`,
  CLEANUP: () => 
    'Cleaning up plugin...',
  PROCESSING_PAGE: (name: string) => 
    `\nProcessing page: ${name}`,
  SKIPPING_PAGE_NO_TARGET: (name: string) => 
    `Skipping page ${name} - no target block found`,
  EVENTS_FOUND: (events: string[]) => 
    'Events found for page: ' + JSON.stringify(events),
  SORTED_EVENTS: (pageName: string, events: string[]) => 
    `Sorted events for ${pageName}: ${JSON.stringify(events)}`,
  DELETING_EVENTS: () => 
    'Deleting old events...',
  REORDERING_EVENTS: () => 
    'Reordering blocks...',
  SYNC_COMPLETE: () => 
    'Sync completed.',
  CREATING_BLOCK: (content: string) => 
    `Creating new block for event: ${content}`,
  SETTING_UID: (uuid: string, uid: string) => 
    `Setting ics-uid property for block ${uuid}: ${uid}`,
  BLOCK_CREATION_FAILED: () => 
    'New block creation failed or block has no UUID',
  UPDATING_BLOCK: (uid: string) => 
    `Updating existing block content for event with UID ${uid}`,
  EVENT_EXISTS: (uid: string) => 
    `Event already exists with UID: ${uid}`,
  MOVING_BLOCK: (content: string, uuid: string) => 
    `Moving block: ${content} (UUID: ${uuid})`,
  MOVING_BEFORE_SIBLING: (content: string, uuid: string) => 
    `Moving before sibling: ${content} (UUID: ${uuid})`,
  REORDER_COMPLETE: () => 
    'Reordering complete',
  CHECKING_CALENDAR_EVENT: (params: { content: string; cleanContent: string; safeMode: boolean; result: boolean }) => 
    `Checking if calendar event: ${JSON.stringify(params)}`,
  COMPARING_BLOCKS: (a: string, b: string, result: number) => 
    `Comparing blocks: a: "${a}", b: "${b}", result: ${result}`,
  CHILD_BLOCKS: (blocks: Array<{ content: string | undefined; uuid: string | undefined }>) => 
    `All child blocks: ${JSON.stringify(blocks)}`,
  FILTERING_BLOCK: (content: string | undefined, isCalendarEvent: boolean) => 
    `Filtering block: content: "${content}", isCalendarEvent: ${isCalendarEvent}`,
  PROCESSING_MULTIDAY: (summary: string) => 
    `Processing multi-day all-day event: ${summary}`,
  ADDING_EVENT_FOR_DATE: (dayName: string, content: string) => 
    `Adding event for date: ${dayName} -> ${content}`,
  ADDING_SINGLE_EVENT: (content: string, page: string) => 
    `Adding single-day event: ${content} -> Page: ${page}`,
  PROCESSING_JOURNAL: (pageName: string) => 
    `Processing journal page: ${pageName}`,
  JOURNAL_NOT_FOUND: (pageName: string) => 
    `Journal page not found: ${pageName}`,
  NO_TARGET_BLOCK: () => 
    'No target block found, skipping page',
  CHECKING_EVENT: (content: string) => 
    `Checking event: ${content}`,
  FAILED_CREATE_BLOCK: (error: Error) => 
    `Failed to create new block: ${error}`,
  FAILED_SET_PROPERTY: (error: Error) => 
    `Failed to set ics-uid property: ${error}`,
  FETCH_ERROR: (url: string, error: Error) => 
    `Error fetching ICS data from ${url}: ${error}`,
  PROCESSING_URL: (url: string) => 
    `Processing URL: ${url}`,
  ICS_FETCH_SUCCESS: () => 
    'ICS data fetched successfully',
  PROCESSED_EVENTS: (events: CalendarEvent[]) => 
    `Processed events: ${JSON.stringify(events)}`,
  NO_URLS: () => 
    'No ICS URLs configured.',
  FETCH_FAIL: () => 
    'Failed to fetch any calendar data.',
  ADDING_EVENTS: () => 
    'Adding new events...',
  FOUND_PAGES: (count: number) => 
    `Found ${count} journal pages to process`,
  NEW_JOURNAL_PAGE: (name: string) => 
    `New journal page detected: ${name}`,
  SYNC_FAIL: (error: Error) => 
    `Failed to sync on new journal page: ${error}`,
  EXITING_EDIT_MODE: (blockUuid: string) => 
    `Attempting to exit edit mode for block: ${blockUuid}`,
  EDIT_MODE_EXIT_SUCCESS: (blockUuid: string) => 
    `Successfully exited edit mode for block: ${blockUuid}`,
  EDIT_MODE_EXIT_FAIL: (blockUuid: string, error: Error) => 
    `Failed to exit edit mode for block ${blockUuid}: ${error}`,
  BLOCK_OPERATION_START: (operation: string, content: string) => 
    `Starting ${operation} for block: ${content}`,
  BLOCK_OPERATION_END: (operation: string, content: string) => 
    `Completed ${operation} for block: ${content}`,
  NO_REORDER_SINGLE_BLOCK: () => 
    'No reordering needed - one or fewer blocks',
  NO_REORDER_SINGLE_EVENT: () => 
    'No reordering needed - one or fewer calendar events',
  NO_REORDER_CORRECT_ORDER: () => 
    'No reordering needed - blocks already in correct order',
  CHECKING_BLOCK_ORDER: (block: BlockEntity, index: number, currentUuid: string | undefined) => 
    `Checking block order: Block ${block.uuid} at index ${index}, current sibling: ${currentUuid}`,
  TARGET_BLOCK_NOT_FOUND: () => 
    'Could not fetch updated Target block',
  REORDER_NEEDED: () => 
    'Reordering needed - blocks not in correct order',
  BLOCK_CREATED: (uuid: string) => 
    `Block created with UUID: ${uuid}`,
  BLOCK_UPDATED: (uuid: string) => 
    `Block updated with UUID: ${uuid}`,
  CURRENT_EDITING_BLOCK: (uuid: string | null) => 
    `Current editing block: ${uuid || 'none'}`,
  ATTEMPTING_EXIT_ALL: () => 
    'Attempting to exit all editing modes',
} as const;

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
    console.error(LOG_MESSAGES.FETCH_ERROR(url, error as Error));
    return null;
  }
}

interface CalendarEvent {
  pageName: string;
  content: string;
  uid: string;
}

function isAllDayEvent(content: string): boolean {
  const { cleanContent } = getFirstLineContent(content);
  return cleanContent.includes('All Day');
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

// Remove the logging from isCalendarEvent since it's a utility function
function isCalendarEvent(content: string): boolean {
  const { cleanContent } = getFirstLineContent(content);
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
    // Updated regex to handle both ** and non-** formats
    const match = cleanContent.match(/📅 (?:\*\*)?(\d{4}) - \d{4}(?:\*\*)?:(.+)/);
    if (match) {
      time = match[1];
      name = normalizeEventName(match[2]);
    }
  }

  return { isAllDay, time, name };
}

// Update compareEvents to handle markdown in struck-through check
function compareEvents(a: string, b: string): number {
  const { cleanContent: aClean } = getFirstLineContent(a);
  const { cleanContent: bClean } = getFirstLineContent(b);
  
  const aKey = getEventSortKey(aClean);
  const bKey = getEventSortKey(bClean);
  
  // All-day events come first
  if (aKey.isAllDay !== bKey.isAllDay) {
    return aKey.isAllDay ? -1 : 1;
  }
  
  // Compare times numerically
  const aTime = parseInt(aKey.time || '2400');
  const bTime = parseInt(bKey.time || '2400');
  
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  
  // If times are equal, sort by name
  return aKey.name.localeCompare(bKey.name);
}

async function processICSEvents(icsData: ICAL.Component): Promise<Map<string, CalendarEvent>> {
  const eventMap = new Map<string, CalendarEvent>();
  const events = icsData.getAllSubcomponents('vevent');

  for (const event of events) {
    const vevent = new ICAL.Event(event);
    const uid = vevent.uid;

    if (vevent.startDate.isDate && vevent.endDate.isDate) {
      console.log(LOG_MESSAGES.PROCESSING_MULTIDAY(vevent.summary));
      let currentDate = vevent.startDate.clone();
      const endDate = vevent.endDate.clone();

      while (currentDate.compare(endDate) <= 0) {
        const dayOriginalName = getOriginalNameForDate(currentDate.toJSDate());
        const eventContent = formatEventContent(vevent.summary);

        console.log(LOG_MESSAGES.ADDING_EVENT_FOR_DATE(dayOriginalName, eventContent));
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

      const eventContent = formatEventContent(summary, startTime, endTime);
      const originalName = getOriginalNameForDate(vevent.startDate.toJSDate());

      console.log(LOG_MESSAGES.ADDING_SINGLE_EVENT(eventContent, originalName));
      eventMap.set(`${originalName}-${eventContent}`, {
        pageName: originalName,
        content: eventContent,
        uid
      });
    }
  }

  return eventMap;
}

async function syncCalendar() {
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
    console.log(LOG_MESSAGES.PROCESSING_URL(url));
    const icsData = await fetchICSData(url);
    if (icsData) {
      console.log(LOG_MESSAGES.ICS_FETCH_SUCCESS());
      const events = await processICSEvents(icsData);
      console.log(LOG_MESSAGES.PROCESSED_EVENTS(Array.from(events.values())));
      events.forEach((value, key) => eventMap.set(key, value));
      successfulFetches++;
    }
  }

  if (successfulFetches === 0) {
    logseq.UI.showMsg(LOG_MESSAGES.FETCH_FAIL(), 'error');
    return;
  }

  console.log(LOG_MESSAGES.ADDING_EVENTS());

  // Get all journal pages
  const allPages = await logseq.Editor.getAllPages() ?? [];
  const journalPages = allPages.filter(page => page?.['journal?'] || page?.journal);
  console.log(LOG_MESSAGES.FOUND_PAGES(journalPages.length));

  // Process each journal page
  for (const page of journalPages) {
    console.log(LOG_MESSAGES.PROCESSING_PAGE(page.name));
    
    const blocks = await logseq.Editor.getPageBlocksTree(page.name) as BlockEntity[];
    const targetBlock = findDailyPlanBlock(blocks, targetHeader);

    if (!targetBlock) {
      console.log(LOG_MESSAGES.SKIPPING_PAGE_NO_TARGET(page.name));
      continue;
    }

    // Get events for this page
    const pageEvents = Array.from(eventMap.values())
      .filter(e => normalizeEventName(e.pageName) === normalizeEventName(page.name))
      .map(e => ({ content: e.content, uid: e.uid }));

    // Add new events and handle updates
    await addNewEvents(targetBlock, pageEvents);
    
    // Delete removed events and reorder
    await deleteEvents(targetBlock, eventMap);
    await reorderEvents(targetBlock);
  }

  logseq.UI.showMsg(LOG_MESSAGES.SYNC_COMPLETE());
}

// Update addNewEvents to take targetBlock directly
async function addNewEvents(targetBlock: BlockEntity, events: Array<{ content: string; uid: string }>) {
  // Sort events
  const sortedEvents = sortCalendarEvents(events.map(e => e.content));
  
  // Create new blocks for events that don't exist
  for (const [index, eventContent] of sortedEvents.entries()) {
    const isLastEvent = index === sortedEvents.length - 1;
    console.log(LOG_MESSAGES.CHECKING_EVENT(eventContent));
    
    // Find the corresponding event with UID
    const event = events.find(e => e.content === eventContent);
    if (!event) continue;

    // Format the content with markdown inline
    const formattedContent = ensureMarkdownFormatting(eventContent);

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
      try {
        const newBlock = await logseq.Editor.insertBlock(
          targetBlock.uuid,
          formattedContent,
          { sibling: false }
        );

        if (newBlock && newBlock.uuid) {
          const finishOperation = await logBlockOperation('creation', formattedContent, newBlock.uuid);
          
          await exitEditMode(newBlock.uuid);
          await logseq.Editor.upsertBlockProperty(newBlock.uuid, 'ics-uid', event.uid);
          await exitEditMode(newBlock.uuid, isLastEvent);
          
          await finishOperation();
        }
      } catch (error) {
        console.error(LOG_MESSAGES.FAILED_CREATE_BLOCK(error as Error));
      }
    } else {
      if (normalizeEventName(matchingBlock.block.content.split('\n')[0]) !== normalizeEventName(eventContent)) {
        const finishOperation = await logBlockOperation('update', formattedContent, matchingBlock.block.uuid);
        await logseq.Editor.updateBlock(matchingBlock.block.uuid, formattedContent);
        await exitEditMode(matchingBlock.block.uuid, isLastEvent);
        await finishOperation();
      }
    }
  }
}

async function deleteEvents(targetBlock: BlockEntity, eventMap: Map<string, CalendarEvent>) {
  console.log(LOG_MESSAGES.DELETING_EVENTS());
  
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
  console.log(LOG_MESSAGES.REORDERING_EVENTS());
  
  // Get all child blocks
  const childBlocks = await getChildBlocks(targetBlock);
  
  // Filter calendar events with single logging
  const calendarBlocks = childBlocks.filter(block => {
    if (!block) return false;
    const isCalendar = isCalendarEvent(block.content);
    console.log(LOG_MESSAGES.FILTERING_BLOCK(block.content, isCalendar));
    return isCalendar;
  });
  
  // Early return if one or fewer calendar events
  if (calendarBlocks.length <= 1) {
    console.log('No reordering needed - one or fewer calendar events');
    return;
  }

  // Sort calendar blocks chronologically
  const sortedCalendarBlocks = [...calendarBlocks].sort((a, b) => {
    const result = compareEvents(a.content, b.content);
    console.log(`Comparing blocks:`, {
      blockA: {
        time: getEventSortKey(a.content).time,
        content: a.content
      },
      blockB: {
        time: getEventSortKey(b.content).time,
        content: b.content
      },
      result
    });
    return result;
  });

  // Check if blocks are already in correct order
  let needsReordering = false;
  for (let i = 0; i < calendarBlocks.length; i++) {
    if (calendarBlocks[i].uuid !== sortedCalendarBlocks[i].uuid) {
      needsReordering = true;
      break;
    }
  }

  if (!needsReordering) {
    console.log('No reordering needed - blocks already in correct order');
    return;
  }

  // Move blocks in chronological order
  for (let i = 0; i < sortedCalendarBlocks.length; i++) {
    const block = sortedCalendarBlocks[i];
    
    console.log(`Moving block ${i + 1}/${sortedCalendarBlocks.length}:`, {
      time: getEventSortKey(block.content).time,
      content: block.content,
      isFirstBlock: i === 0
    });
    
    if (i === 0) {
      await logseq.Editor.moveBlock(block.uuid, targetBlock.uuid, {
        before: false,
        children: true
      });
    } else {
      const prevBlock = sortedCalendarBlocks[i - 1];
      await logseq.Editor.moveBlock(block.uuid, prevBlock.uuid, {
        before: false
      });
    }
  }
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

// Add a utility function for waiting
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Create a utility function for common block operations logging
async function logBlockOperation(operation: 'creation' | 'update', content: string, blockUuid: string) {
  console.log(LOG_MESSAGES.BLOCK_OPERATION_START(operation, content));
  console.log(LOG_MESSAGES.BLOCK_CREATED(blockUuid));
  return async () => {
    console.log(LOG_MESSAGES.BLOCK_OPERATION_END(operation, content));
  };
}

// Create a utility function for exiting edit mode
async function exitEditMode(blockUuid: string, isLastEvent: boolean = false) {
  try {
    await exitEditModeOnce(blockUuid);
    if (isLastEvent) {
      await wait(50);
      await exitEditModeOnce(blockUuid);
    }
    console.log(LOG_MESSAGES.EDIT_MODE_EXIT_SUCCESS(blockUuid));
  } catch (error) {
    console.error(LOG_MESSAGES.EDIT_MODE_EXIT_FAIL(blockUuid, error as Error));
  }
}

// Utility for formatting event content
function formatEventContent(summary: string, startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) {
    return `📅 **All Day:** ${summary || 'No Title'}`;
  }
  return `📅 ${startTime} - ${endTime}: ${summary || 'No Title'}`;
}

// Utility for ensuring markdown formatting
function ensureMarkdownFormatting(content: string): string {
  if (isAllDayEvent(content)) {
    return content.replace(/(📅 )(All Day:)(.+)/, '$1**$2**$3');
  }
  return content.replace(/(📅 )(\d{4}) - (\d{4}:)(.+)/, '$1**$2 - $3**$4');
}

// Utility for exiting edit mode once
async function exitEditModeOnce(blockUuid: string): Promise<void> {
  await logseq.Editor.selectBlock(blockUuid);
  await logseq.Editor.exitEditingMode();
}

function main() {
  console.log(LOG_MESSAGES.PLUGIN_LOADED());
  console.log(LOG_MESSAGES.SAFE_MODE_STATUS(!!logseq.settings?.safeMode));

  // Clean up sync-calendar command and interval before registering new one
  logseq.beforeunload(async () => {
    console.log(LOG_MESSAGES.CLEANUP());
    if (syncIntervalId) clearInterval(syncIntervalId);
    await logseq.App.registerCommandPalette(
      {
        key: 'sync-calendar',
        label: 'Sync Calendar'
      },
      () => {}
    );
  });

  logseq.useSettingsSchema(settingsSchema);

  // Register command palette for manual sync
  logseq.App.registerCommandPalette(
    {
      key: 'sync-calendar',
      label: 'Sync Calendar',
    },
    syncCalendar
  );

  // Schedule daily sync at 12:01 AM
  const scheduleNextSync = () => {
    const now = new Date();
    const nextSync = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // next day
      0, // hour: 00
      1, // minute: 01
      0  // second: 00
    );
    
    const msUntilNextSync = nextSync.getTime() - now.getTime();
    console.log(`Next sync scheduled in ${Math.round(msUntilNextSync / 1000 / 60)} minutes`);
    
    return setTimeout(async () => {
      await syncCalendar();
      syncIntervalId = setInterval(syncCalendar, 24 * 60 * 60 * 1000); // Run every 24 hours after first sync
    }, msUntilNextSync);
  };

  // Start the scheduling
  let syncIntervalId = scheduleNextSync();
}

logseq.ready(main).catch(console.error);
