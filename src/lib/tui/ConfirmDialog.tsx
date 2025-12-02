/** @jsxImportSource @opentui/react */
import { useKeyboard } from '@opentui/react';
import { useState } from 'react';

export interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  focused?: boolean;
}

/**
 * A confirmation dialog for destructive or important actions
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  dangerous = false,
  onConfirm,
  onCancel,
  focused = true,
}: ConfirmDialogProps) {
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');

  useKeyboard((key) => {
    if (!focused) return;

    if (key.name === 'escape') {
      onCancel?.();
    } else if (key.name === 'return') {
      if (selected === 'confirm') {
        onConfirm?.();
      } else {
        onCancel?.();
      }
    } else if (key.name === 'left' || key.name === 'h') {
      setSelected('confirm');
    } else if (key.name === 'right' || key.name === 'l') {
      setSelected('cancel');
    } else if (key.name === 'tab') {
      setSelected((prev: 'confirm' | 'cancel') =>
        prev === 'confirm' ? 'cancel' : 'confirm',
      );
    } else if (key.sequence === 'y' || key.sequence === 'Y') {
      onConfirm?.();
    } else if (key.sequence === 'n' || key.sequence === 'N') {
      onCancel?.();
    }
  });

  const confirmColor = dangerous ? '#FF6666' : '#66FF66';
  const confirmBg = selected === 'confirm' ? confirmColor : undefined;
  const confirmFg = selected === 'confirm' ? '#000000' : confirmColor;

  const cancelBg = selected === 'cancel' ? '#888888' : undefined;
  const cancelFg = selected === 'cancel' ? '#000000' : '#888888';

  return (
    <box
      style={{
        flexDirection: 'column',
        border: true,
        borderColor: dangerous ? '#FF6666' : '#FFFF00',
        padding: 1,
      }}
    >
      {title && (
        <box style={{ marginBottom: 1 }}>
          <text style={{ fg: dangerous ? '#FF6666' : '#FFFF00' }}>{title}</text>
        </box>
      )}

      <box style={{ marginBottom: 1 }}>
        <text>{message}</text>
      </box>

      <box style={{ flexDirection: 'row', gap: 2, justifyContent: 'center' }}>
        <box
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            backgroundColor: confirmBg,
          }}
        >
          <text style={{ fg: confirmFg }}>
            [{selected === 'confirm' ? '●' : ' '}] {confirmLabel}
          </text>
        </box>

        <box
          style={{
            paddingLeft: 2,
            paddingRight: 2,
            backgroundColor: cancelBg,
          }}
        >
          <text style={{ fg: cancelFg }}>
            [{selected === 'cancel' ? '●' : ' '}] {cancelLabel}
          </text>
        </box>
      </box>

      <box style={{ marginTop: 1 }}>
        <text style={{ fg: '#666666' }}>
          ←→ to switch • Enter to select • y/n to answer • Esc to cancel
        </text>
      </box>
    </box>
  );
}
