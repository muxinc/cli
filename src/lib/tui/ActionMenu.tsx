/** @jsxImportSource @opentui/react */
import type { SelectOption } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState, useCallback } from "react";

export interface Action<T = string> {
	id: T;
	label: string;
	description?: string;
	dangerous?: boolean;
}

export interface ActionMenuProps<T = string> {
	title?: string;
	actions: Action<T>[];
	onAction?: (actionId: T) => void;
	onCancel?: () => void;
	focused?: boolean;
}

/**
 * A menu for selecting an action to perform on an item
 */
export function ActionMenu<T = string>({
	title,
	actions,
	onAction,
	onCancel,
	focused = true,
}: ActionMenuProps<T>) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Convert actions to OpenTUI SelectOptions
	const options: SelectOption[] = actions.map((action) => ({
		name: action.dangerous ? `⚠ ${action.label}` : action.label,
		description: action.description ?? "",
		value: action.id as string,
	}));

	const handleSelect = useCallback(
		(index: number) => {
			const action = actions[index];
			if (action && onAction) {
				onAction(action.id);
			}
		},
		[actions, onAction],
	);

	useKeyboard((key) => {
		if (!focused) return;

		if (key.name === "escape" || key.name === "q") {
			onCancel?.();
		} else if (key.name === "return") {
			handleSelect(selectedIndex);
		}
	});

	return (
		<box style={{ flexDirection: "column", flexGrow: 1 }}>
			{title && (
				<box style={{ marginBottom: 1 }}>
					<text style={{ fg: "#FFFF00" }}>{title}</text>
				</box>
			)}

			<box style={{ marginBottom: 1 }}>
				<text style={{ fg: "#888888" }}>
					↑↓ navigate • Enter select • Esc back
				</text>
			</box>

			<box style={{ border: true, flexGrow: 1, minHeight: options.length + 2 }}>
				<select
					options={options}
					focused={focused}
					onChange={(index) => {
						setSelectedIndex(index);
					}}
					style={{ width: "100%", flexGrow: 1 }}
				/>
			</box>
		</box>
	);
}
