/** @jsxImportSource @opentui/react */
import type { SelectOption } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import { useCallback, useState } from 'react';

export interface SelectListItem<T = unknown> {
  id: string;
  label: string;
  description?: string;
  value: T;
}

export interface SelectListProps<T = unknown> {
  items: SelectListItem<T>[];
  title?: string;
  onSelect?: (item: SelectListItem<T>) => void;
  onCancel?: () => void;
  focused?: boolean;
  showHelp?: boolean;
}

/**
 * A reusable select list component for browsing and selecting items
 */
export function SelectList<T = unknown>({
  items,
  title,
  onSelect,
  onCancel,
  focused = true,
  showHelp = true,
}: SelectListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Convert our items to OpenTUI SelectOptions
  const options: SelectOption[] = items.map((item) => ({
    name: item.label,
    description: item.description ?? '',
    value: item.id,
  }));

  const handleSelect = useCallback(
    (index: number) => {
      const item = items[index];
      if (item && onSelect) {
        onSelect(item);
      }
    },
    [items, onSelect],
  );

  useKeyboard((key) => {
    if (!focused) return;

    if (key.name === 'escape' || key.name === 'q') {
      onCancel?.();
    } else if (key.name === 'return') {
      handleSelect(selectedIndex);
    }
  });

  if (items.length === 0) {
    return (
      <box style={{ padding: 1 }}>
        <text>No items found.</text>
      </box>
    );
  }

  return (
    <box style={{ flexDirection: 'column', flexGrow: 1 }}>
      {title && (
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: '#00FFFF' }}>{title}</text>
        </box>
      )}

      {showHelp && (
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: '#888888' }}>
            ↑↓ navigate • Enter select • q quit
          </text>
        </box>
      )}

      <box
        style={{
          border: true,
          flexGrow: 1,
          minHeight: Math.min(items.length + 2, 20),
        }}
      >
        <select
          options={options}
          focused={focused}
          onChange={(index) => {
            setSelectedIndex(index);
          }}
          style={{ flexGrow: 1, height: Math.min(items.length, 18) }}
        />
      </box>
    </box>
  );
}
