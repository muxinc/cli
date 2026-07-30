/** @jsxImportSource @opentui/react */
import { useKeyboard, useRenderer } from '@opentui/react';
import { useCallback, useEffect, useState } from 'react';
import {
  getEventTypes,
  listEvents,
  listEventsByType,
  type StoredEvent,
} from '@/lib/events-store.ts';
import {
  type Action,
  ActionMenu,
  copyToClipboard,
  SelectList,
  type SelectListItem,
} from '@/lib/tui/index.ts';
import { buildSignedHeaders, getSigningSecret } from '@/lib/webhook-signing.ts';

type View = 'list' | 'detail' | 'filter-type' | 'message';

interface EventsBrowserAppProps {
  environmentId: string;
  /** Key for the local webhook signing secret (environment name or id). */
  signingSecretKey: string;
  forwardTo?: string;
}

const PAGE_SIZE = 100;

function formatEventLabel(event: StoredEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  return `[${time}]  ${event.type.padEnd(30)}  ${event.id}`;
}

export function EventsBrowserApp({
  environmentId,
  signingSecretKey,
  forwardTo,
}: EventsBrowserAppProps) {
  const renderer = useRenderer();
  const [view, setView] = useState<View>('list');
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<StoredEvent | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>(
    'success',
  );

  const loadEvents = useCallback(() => {
    const loaded = typeFilter
      ? listEventsByType(environmentId, typeFilter, PAGE_SIZE)
      : listEvents(environmentId, PAGE_SIZE);
    setEvents(loaded);
  }, [environmentId, typeFilter]);

  useEffect(() => {
    loadEvents();
    setEventTypes(getEventTypes(environmentId));
  }, [loadEvents, environmentId]);

  const showMessage = useCallback(
    (msg: string, type: 'success' | 'error' = 'success') => {
      setMessage(msg);
      setMessageType(type);
      setView('message');
    },
    [],
  );

  const handleReplay = useCallback(
    async (event: StoredEvent) => {
      if (!forwardTo) return;
      try {
        const signingSecret = await getSigningSecret(signingSecretKey);
        const body = JSON.stringify(event.payload);
        const response = await fetch(forwardTo, {
          method: 'POST',
          headers: buildSignedHeaders(body, signingSecret),
          body,
        });
        if (response.status >= 200 && response.status < 300) {
          showMessage(
            `[${response.status}] Forwarded ${event.type} (${event.id}) to ${forwardTo}`,
          );
        } else {
          showMessage(
            `[${response.status}] Failed to forward ${event.type} (${event.id})`,
            'error',
          );
        }
      } catch {
        showMessage(
          `Failed to forward event to ${forwardTo}\nIs a webserver running at that URL?`,
          'error',
        );
      }
    },
    [forwardTo, signingSecretKey, showMessage],
  );

  useKeyboard((key) => {
    if (view === 'list') {
      if (key.sequence === 'f') {
        setView('filter-type');
      } else if (key.sequence === 'c' && typeFilter) {
        setTypeFilter(null);
      } else if (key.name === 'escape' || key.sequence === 'q') {
        renderer.destroy();
        process.exit(0);
      }
    }

    if (view === 'message') {
      if (key.name === 'return' || key.name === 'escape') {
        if (selectedEvent) {
          setView('detail');
        } else {
          setView('list');
        }
      }
    }
  });

  const eventItems: SelectListItem<StoredEvent>[] = events.map((event) => ({
    id: event.id,
    label: formatEventLabel(event),
    value: event,
  }));

  // Event list view
  if (view === 'list') {
    const title = typeFilter
      ? `Webhook Events (filtered: ${typeFilter})`
      : 'Webhook Events';

    const helpParts = ['↑↓ navigate', 'Enter select', 'f filter'];
    if (typeFilter) helpParts.push('c clear filter');
    helpParts.push('q quit');

    return (
      <box style={{ flexDirection: 'column', flexGrow: 1 }}>
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: '#00FFFF' }}>{title}</text>
        </box>
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: '#888888' }}>{helpParts.join(' • ')}</text>
        </box>
        {eventItems.length === 0 ? (
          <box style={{ padding: 1 }}>
            <text>
              {typeFilter
                ? `No events matching type "${typeFilter}". Press c to clear filter.`
                : 'No stored events. Run `mux webhooks listen` to capture events.'}
            </text>
          </box>
        ) : (
          <SelectList
            items={eventItems}
            showHelp={false}
            onSelect={(item) => {
              setSelectedEvent(item.value);
              setView('detail');
            }}
          />
        )}
      </box>
    );
  }

  // Filter by event type
  if (view === 'filter-type') {
    const typeItems: SelectListItem<string | null>[] = [
      { id: '__all__', label: 'All event types', value: null },
      ...eventTypes.map((type) => ({
        id: type,
        label: type,
        value: type as string | null,
      })),
    ];

    return (
      <SelectList
        title="Filter by event type"
        items={typeItems}
        onSelect={(item) => {
          setTypeFilter(item.value);
          setView('list');
        }}
        onCancel={() => setView('list')}
      />
    );
  }

  // Event detail: actions on the left, payload on the right
  if (view === 'detail' && selectedEvent) {
    type EventAction = 'copy-payload' | 'copy-id' | 'replay';
    const actions: Action<EventAction>[] = [
      { id: 'copy-payload', label: 'Copy payload to clipboard' },
      { id: 'copy-id', label: 'Copy event ID to clipboard' },
    ];
    if (forwardTo) {
      actions.push({
        id: 'replay',
        label: `Forward to ${forwardTo}`,
      });
    }

    const time = new Date(selectedEvent.timestamp).toLocaleString();
    const payloadStr = JSON.stringify(selectedEvent.payload, null, 2);

    return (
      <box style={{ flexDirection: 'column', flexGrow: 1 }}>
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: '#FFFF00' }}>{selectedEvent.type}</text>
        </box>
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: '#888888' }}>
            {selectedEvent.id} • {time}
          </text>
        </box>
        <box style={{ flexDirection: 'row', flexGrow: 1, gap: 1 }}>
          <box style={{ width: '40%' }}>
            <ActionMenu
              actions={actions}
              onAction={async (actionId) => {
                switch (actionId) {
                  case 'copy-payload':
                    try {
                      await copyToClipboard(payloadStr);
                      showMessage('Payload copied to clipboard');
                    } catch {
                      showMessage('Failed to copy to clipboard', 'error');
                    }
                    break;
                  case 'copy-id':
                    try {
                      await copyToClipboard(selectedEvent.id);
                      showMessage('Event ID copied to clipboard');
                    } catch {
                      showMessage('Failed to copy to clipboard', 'error');
                    }
                    break;
                  case 'replay':
                    await handleReplay(selectedEvent);
                    break;
                }
              }}
              onCancel={() => {
                setSelectedEvent(null);
                setView('list');
              }}
            />
          </box>
          <box style={{ width: '60%', border: true, padding: 1 }}>
            <text>{payloadStr}</text>
          </box>
        </box>
      </box>
    );
  }

  // Message view
  if (view === 'message') {
    const color = messageType === 'success' ? '#66FF66' : '#FF6666';
    const messageLines = message.split('\n');
    return (
      <box style={{ flexDirection: 'column', padding: 1 }}>
        <box style={{ flexDirection: 'column', marginBottom: 1 }}>
          {messageLines.map((line) => (
            <text key={line} style={{ fg: color }}>
              {line}
            </text>
          ))}
        </box>
        <text style={{ fg: '#888888' }}>Press Enter to continue</text>
      </box>
    );
  }

  return null;
}
