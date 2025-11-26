/** @jsxImportSource @opentui/react */
import type Mux from "@mux/mux-node";
import type { Asset } from "@mux/mux-node/resources/video/assets";
import { useKeyboard, useRenderer } from "@opentui/react";
import { useState, useEffect, useCallback } from "react";
import {
	SelectList,
	ActionMenu,
	ConfirmDialog,
	copyToClipboard,
	type SelectListItem,
	type Action,
} from "../../../lib/tui/index.ts";
import { getStreamUrl, getPlayerUrl } from "../../../lib/urls.ts";
import {
	createPlaybackId,
	deletePlaybackId,
} from "../../../lib/playback-ids.ts";
import { signPlaybackId, hasSigningKeys } from "../../../lib/signing.ts";
import { getDefaultEnvironment } from "../../../lib/config.ts";

type View =
	| "list"
	| "actions"
	| "confirm-delete"
	| "confirm-delete-playback"
	| "select-playback-id"
	| "select-playback-policy"
	| "select-playback-for-copy"
	| "loading"
	| "message";

type CopyType = "stream" | "player";

interface AssetManageAppProps {
	mux: Mux;
}

export function AssetManageApp({ mux }: AssetManageAppProps) {
	const renderer = useRenderer();
	const [view, setView] = useState<View>("loading");
	const [assets, setAssets] = useState<Asset[]>([]);
	const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
	const [selectedPlaybackId, setSelectedPlaybackId] = useState<string | null>(
		null,
	);
	const [copyType, setCopyType] = useState<CopyType | null>(null);
	const [message, setMessage] = useState<string>("");
	const [messageType, setMessageType] = useState<"success" | "error">(
		"success",
	);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);

	// Load assets on mount
	useEffect(() => {
		loadAssets();
	}, []);

	const loadAssets = useCallback(
		async (pageNum = 1) => {
			try {
				if (pageNum === 1) {
					setView("loading");
				} else {
					setLoadingMore(true);
				}
				const response = await mux.video.assets.list({
					page: pageNum,
					limit: 25,
				});
				if (pageNum === 1) {
					setAssets(response.data ?? []);
				} else {
					setAssets((prev) => [...prev, ...(response.data ?? [])]);
				}
				setHasMore((response.data?.length ?? 0) === 25);
				setPage(pageNum);
				setLoadingMore(false);
				setView("list");
			} catch (error) {
				setLoadingMore(false);
				showMessage(
					`Failed to load assets: ${error instanceof Error ? error.message : "Unknown error"}`,
					"error",
				);
			}
		},
		[mux],
	);

	const showMessage = useCallback(
		(msg: string, type: "success" | "error" = "success") => {
			setMessage(msg);
			setMessageType(type);
			setView("message");
		},
		[],
	);

	const handleAssetSelect = useCallback(
		(item: SelectListItem<Asset | null>) => {
			if (item.id === "__load_more__") {
				loadAssets(page + 1);
				return;
			}
			if (item.value) {
				setSelectedAsset(item.value);
				setView("actions");
			}
		},
		[loadAssets, page],
	);

	const copyUrl = useCallback(
		async (
			type: CopyType,
			playbackId: NonNullable<Asset["playback_ids"]>[0],
		) => {
			try {
				const id = playbackId.id as string;
				let url = type === "stream" ? getStreamUrl(id) : getPlayerUrl(id);

				if (playbackId.policy === "signed") {
					const token = await getSignedToken(id);
					if (token) {
						url =
							type === "stream"
								? getStreamUrl(id, token)
								: getPlayerUrl(id, token);
					}
				}
				await copyToClipboard(url);
				showMessage(
					`${type === "stream" ? "Stream" : "Player"} URL copied to clipboard!`,
				);
			} catch (error) {
				showMessage(
					`Failed to copy: ${error instanceof Error ? error.message : "Unknown error"}`,
					"error",
				);
			}
		},
		[showMessage],
	);

	const handleAction = useCallback(
		async (actionId: string) => {
			if (!selectedAsset) return;

			const playbackIds = selectedAsset.playback_ids ?? [];

			switch (actionId) {
				case "copy-stream": {
					if (playbackIds.length === 0) {
						showMessage("No playback ID available", "error");
						return;
					}
					if (playbackIds.length > 1) {
						setCopyType("stream");
						setView("select-playback-for-copy");
						return;
					}
					await copyUrl("stream", playbackIds[0]);
					break;
				}

				case "copy-player": {
					if (playbackIds.length === 0) {
						showMessage("No playback ID available", "error");
						return;
					}
					if (playbackIds.length > 1) {
						setCopyType("player");
						setView("select-playback-for-copy");
						return;
					}
					await copyUrl("player", playbackIds[0]);
					break;
				}

				case "create-playback":
					setView("select-playback-policy");
					break;

				case "delete-playback":
					if (!selectedAsset.playback_ids?.length) {
						showMessage("No playback IDs to delete", "error");
						return;
					}
					if (selectedAsset.playback_ids.length === 1) {
						setSelectedPlaybackId(selectedAsset.playback_ids[0].id as string);
						setView("confirm-delete-playback");
					} else {
						setView("select-playback-id");
					}
					break;

				case "delete-asset":
					setView("confirm-delete");
					break;

				case "back":
					setSelectedAsset(null);
					setView("list");
					break;
			}
		},
		[selectedAsset],
	);

	const getSignedToken = async (playbackId: string): Promise<string | null> => {
		try {
			const env = await getDefaultEnvironment();
			if (!env) return null;

			const credentials = {
				signingKeyId: env.environment.signingKeyId,
				signingPrivateKey: env.environment.signingPrivateKey,
			};

			if (!hasSigningKeys(credentials)) {
				return null;
			}

			return await signPlaybackId(
				playbackId,
				credentials,
				{
					tokenId: env.environment.tokenId,
					tokenSecret: env.environment.tokenSecret,
				},
				{ expiration: "7d" },
			);
		} catch {
			return null;
		}
	};

	const handleCreatePlaybackId = useCallback(
		async (policy: "public" | "signed") => {
			if (!selectedAsset) return;
			try {
				setView("loading");
				await createPlaybackId(mux, selectedAsset.id as string, policy);
				// Refresh asset data
				const updated = await mux.video.assets.retrieve(
					selectedAsset.id as string,
				);
				setSelectedAsset(updated);
				setAssets((prev) =>
					prev.map((a) => (a.id === updated.id ? updated : a)),
				);
				showMessage(`Created ${policy} playback ID!`);
			} catch (error) {
				showMessage(
					`Failed to create playback ID: ${error instanceof Error ? error.message : "Unknown error"}`,
					"error",
				);
			}
		},
		[mux, selectedAsset],
	);

	const handleDeletePlaybackId = useCallback(async () => {
		if (!selectedAsset || !selectedPlaybackId) return;
		try {
			setView("loading");
			await deletePlaybackId(
				mux,
				selectedAsset.id as string,
				selectedPlaybackId,
			);
			// Refresh asset data
			const updated = await mux.video.assets.retrieve(
				selectedAsset.id as string,
			);
			setSelectedAsset(updated);
			setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
			setSelectedPlaybackId(null);
			showMessage("Playback ID deleted!");
		} catch (error) {
			showMessage(
				`Failed to delete playback ID: ${error instanceof Error ? error.message : "Unknown error"}`,
				"error",
			);
		}
	}, [mux, selectedAsset, selectedPlaybackId]);

	const handleCopyPlaybackId = useCallback(
		async (playbackId: NonNullable<Asset["playback_ids"]>[0]) => {
			if (!copyType) return;
			await copyUrl(copyType, playbackId);
			setCopyType(null);
		},
		[copyType, copyUrl],
	);

	const handleDeleteAsset = useCallback(async () => {
		if (!selectedAsset) return;
		try {
			setView("loading");
			await mux.video.assets.delete(selectedAsset.id as string);
			setAssets((prev) => prev.filter((a) => a.id !== selectedAsset.id));
			setSelectedAsset(null);
			showMessage("Asset deleted!");
			setView("list");
		} catch (error) {
			showMessage(
				`Failed to delete asset: ${error instanceof Error ? error.message : "Unknown error"}`,
				"error",
			);
		}
	}, [mux, selectedAsset]);

	// Global keyboard handler
	useKeyboard((key) => {
		if (
			view === "message" &&
			(key.name === "return" || key.name === "escape")
		) {
			if (selectedAsset) {
				setView("actions");
			} else {
				setView("list");
			}
		}
	});

	// Convert assets to list items
	const assetItems: SelectListItem<Asset | null>[] = assets.map((asset) => ({
		id: asset.id as string,
		label: formatAssetLabel(asset),
		description: formatAssetDescription(asset),
		value: asset,
	}));

	// Add "Load more" option if there are more assets
	if (hasMore) {
		assetItems.push({
			id: "__load_more__",
			label: loadingMore ? "⏳ Loading..." : "⏬ Load more assets...",
			description: "",
			value: null,
		});
	}

	// Asset actions
	const actions: Action[] = [
		{ id: "copy-stream", label: "Copy stream URL (HLS)" },
		{ id: "copy-player", label: "Copy player URL" },
		{ id: "create-playback", label: "Create playback ID" },
		{ id: "delete-playback", label: "Delete playback ID" },
		{ id: "delete-asset", label: "Delete asset", dangerous: true },
		{ id: "back", label: "Back to list" },
	];

	return (
		<box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
			{view === "loading" && (
				<box>
					<text>Loading...</text>
				</box>
			)}

			{view === "list" && (
				<SelectList
					title={`Mux Assets (${assets.length}${hasMore ? "+" : ""})`}
					items={assetItems}
					onSelect={handleAssetSelect}
					onCancel={() => {
						renderer.destroy();
						process.exit(0);
					}}
				/>
			)}

			{view === "actions" && selectedAsset && (
				<AssetActionPanel
					asset={selectedAsset}
					actions={actions}
					onAction={handleAction}
					onCancel={() => {
						setSelectedAsset(null);
						setView("list");
					}}
				/>
			)}

			{view === "confirm-delete" && selectedAsset && (
				<ConfirmDialog
					title="Delete Asset"
					message={`Are you sure you want to delete asset ${selectedAsset.id}? This action cannot be undone.`}
					dangerous
					onConfirm={handleDeleteAsset}
					onCancel={() => setView("actions")}
				/>
			)}

			{view === "confirm-delete-playback" && selectedPlaybackId && (
				<ConfirmDialog
					title="Delete Playback ID"
					message={`Are you sure you want to delete playback ID ${selectedPlaybackId}?`}
					dangerous
					onConfirm={handleDeletePlaybackId}
					onCancel={() => setView("actions")}
				/>
			)}

			{view === "select-playback-id" && selectedAsset && (
				<SelectList
					title="Select Playback ID to Delete"
					items={(selectedAsset.playback_ids ?? []).map((p) => ({
						id: p.id as string,
						label: `${p.id} (${p.policy})`,
						value: p.id as string,
					}))}
					onSelect={(item) => {
						setSelectedPlaybackId(item.value as string);
						setView("confirm-delete-playback");
					}}
					onCancel={() => setView("actions")}
				/>
			)}

			{view === "select-playback-for-copy" && selectedAsset && copyType && (
				<SelectList
					title={`Select Playback ID for ${copyType === "stream" ? "Stream" : "Player"} URL`}
					items={(selectedAsset.playback_ids ?? []).map((p) => ({
						id: p.id as string,
						label: `${p.id} (${p.policy === "signed" ? "🔒 signed" : "🔓 public"})`,
						value: p,
					}))}
					onSelect={(item) => {
						handleCopyPlaybackId(item.value);
					}}
					onCancel={() => {
						setCopyType(null);
						setView("actions");
					}}
				/>
			)}

			{view === "select-playback-policy" && (
				<ActionMenu
					title="Select Playback Policy"
					actions={[
						{
							id: "public",
							label: "Public",
							description: "Anyone with the URL can play",
						},
						{
							id: "signed",
							label: "Signed",
							description: "Requires a signed token to play",
						},
					]}
					onAction={(policy) =>
						handleCreatePlaybackId(policy as "public" | "signed")
					}
					onCancel={() => setView("actions")}
				/>
			)}

			{view === "message" && (
				<box
					style={{
						border: true,
						borderColor: messageType === "success" ? "#66FF66" : "#FF6666",
						padding: 1,
					}}
				>
					<text
						style={{ fg: messageType === "success" ? "#66FF66" : "#FF6666" }}
					>
						{message}
					</text>
					<text style={{ fg: "#888888", marginTop: 1 }}>
						Press Enter or Esc to continue
					</text>
				</box>
			)}
		</box>
	);
}

// Helper component showing asset details with action menu
function AssetActionPanel({
	asset,
	actions,
	onAction,
	onCancel,
}: {
	asset: Asset;
	actions: Action[];
	onAction: (actionId: string) => void;
	onCancel: () => void;
}) {
	return (
		<box style={{ flexDirection: "column", flexGrow: 1 }}>
			{/* Asset details section */}
			<box style={{ border: true, padding: 1, marginBottom: 1 }}>
				<box style={{ flexDirection: "column" }}>
					<text style={{ fg: "#00FFFF", marginBottom: 1 }}>
						Asset: {asset.id}
					</text>
					<box style={{ flexDirection: "row", gap: 3 }}>
						<text>Status: {asset.status}</text>
						<text>
							Duration:{" "}
							{asset.duration ? `${asset.duration.toFixed(2)}s` : "N/A"}
						</text>
						{asset.aspect_ratio && <text>Aspect: {asset.aspect_ratio}</text>}
						{asset.resolution_tier && <text>Res: {asset.resolution_tier}</text>}
					</box>
					{asset.passthrough && (
						<text style={{ fg: "#888888" }}>
							Passthrough: {asset.passthrough}
						</text>
					)}
					{asset.playback_ids && asset.playback_ids.length > 0 && (
						<box style={{ flexDirection: "column", marginTop: 1 }}>
							<text style={{ fg: "#FFFF00" }}>Playback IDs:</text>
							{asset.playback_ids.map((p) => (
								<text key={p.id}>
									{"  "}
									{p.policy === "signed" ? "🔒" : "🔓"} {p.id}
								</text>
							))}
						</box>
					)}
				</box>
			</box>

			{/* Action menu */}
			<ActionMenu
				title="Actions"
				actions={actions}
				onAction={onAction}
				onCancel={onCancel}
			/>
		</box>
	);
}

// Helper functions
function formatAssetLabel(asset: Asset): string {
	const status = (asset.status ?? "unknown").padEnd(9);
	const duration = (
		asset.duration ? formatDuration(asset.duration) : "--:--"
	).padStart(6);
	const policies = asset.playback_ids?.length
		? asset.playback_ids
				.map((p) => (p.policy === "signed" ? "🔒" : "🔓"))
				.join("")
		: "-";

	// Truncate ID if too long, keeping it recognizable
	const idDisplay =
		asset.id && asset.id.length > 24
			? `${asset.id.slice(0, 12)}...${asset.id.slice(-8)}`
			: (asset.id ?? "unknown");

	return `${idDisplay.padEnd(25)} ${status} ${duration}  ${policies}`;
}

function formatAssetDescription(asset: Asset): string {
	if (asset.passthrough) {
		return asset.passthrough;
	}
	return "";
}

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}
