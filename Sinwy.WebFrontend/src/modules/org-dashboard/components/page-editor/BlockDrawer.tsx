import { Drawer } from "@puckeditor/core";
import type { BlockType } from "@sinwy/shared";
import { LockIcon, PlusIcon } from "lucide-react";
import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { UpgradeAction } from "#/shared/components/UpgradePrompt";
import { Button } from "#/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/shared/components/ui/dialog";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { getPlanName, minimumPlanFor } from "#/shared/lib/plans";
import { cn } from "#/shared/lib/utils";
import { type DrawerTile, drawerGroups } from "./block-actions";
import { useBlockActions } from "./use-block-actions";

const line = "rounded-full bg-foreground/25";
const frame = "rounded-sm border border-foreground/30 border-dashed";

const SKETCHES: Record<BlockType, ReactNode> = {
	Hero: (
		<div className="grid h-full place-content-center gap-1 bg-foreground/10">
			<div className="mx-auto h-1.5 w-12 rounded-full bg-foreground/50" />
			<div className={cn("mx-auto h-1 w-8", line)} />
			<div className="mx-auto mt-1 h-2.5 w-7 rounded-sm bg-primary/60" />
		</div>
	),
	Services: (
		<div className="grid h-full content-center gap-1 p-2">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex items-center justify-between gap-2">
					<div className={cn("h-1 w-12", line)} />
					<div className="h-1.5 w-4 rounded-sm bg-primary/50" />
				</div>
			))}
		</div>
	),
	Photos: (
		<div className="grid h-full grid-cols-2 gap-1 p-2">
			<div className="rounded-sm bg-linear-to-br from-foreground/10 to-foreground/30" />
			<div className="rounded-sm bg-linear-to-br from-foreground/10 to-foreground/30" />
		</div>
	),
	Booking: (
		<div className="grid h-full content-center justify-items-center gap-1 p-2">
			<div className="h-1.5 w-10 rounded-full bg-foreground/50" />
			<div className={cn("h-1 w-14", line)} />
			<div className="mt-1 h-2.5 w-9 rounded-sm bg-primary/60" />
		</div>
	),
	Heading: (
		<div className="grid h-full content-center p-2">
			<div className="h-2 w-3/4 rounded-full bg-foreground/50" />
		</div>
	),
	RichText: (
		<div className="grid h-full content-center gap-1 p-2">
			<div className={cn("h-1 w-full", line)} />
			<div className={cn("h-1 w-full", line)} />
			<div className={cn("h-1 w-2/3", line)} />
		</div>
	),
	Image: (
		<div className="h-full p-2">
			<div className="h-full rounded-sm bg-linear-to-br from-foreground/10 to-foreground/30" />
		</div>
	),
	Button: (
		<div className="grid h-full place-content-center">
			<div className="h-3 w-10 rounded-sm bg-primary/60" />
		</div>
	),
	Section: (
		<div className="h-full p-2">
			<div className={cn("h-full", frame)} />
		</div>
	),
	Columns: (
		<div className="grid h-full grid-cols-2 gap-1 p-2">
			<div className={frame} />
			<div className={frame} />
		</div>
	),
};

type BlockAccess = {
	groups: ReturnType<typeof drawerGroups>;
	askToUpgrade: (tile: DrawerTile) => void;
};

const BlockAccessContext = createContext<BlockAccess>({
	groups: drawerGroups([]),
	askToUpgrade: () => {},
});

const tileFor = (groups: BlockAccess["groups"], type: string) =>
	groups.flatMap((group) => group.tiles).find((tile) => tile.type === type);

/** Which blocks the plan allows, and the upgrade dialog for the ones it doesn't. */
export function BlockAccessProvider({ children }: { children: ReactNode }) {
	const { features } = useEntitlements();
	const [upgrading, setUpgrading] = useState<DrawerTile | null>(null);
	const value = useMemo(
		() => ({ groups: drawerGroups(features), askToUpgrade: setUpgrading }),
		[features],
	);
	const plan = upgrading?.lockedBy && minimumPlanFor(upgrading.lockedBy);

	return (
		<BlockAccessContext value={value}>
			{children}
			<Dialog
				open={!!upgrading}
				onOpenChange={(open) => !open && setUpgrading(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{plan
								? `${upgrading?.label} comes with the ${getPlanName(plan)} plan`
								: `${upgrading?.label} isn't available yet`}
						</DialogTitle>
						<DialogDescription>
							{upgrading?.description}{" "}
							{plan
								? `Your plan doesn't include it. Upgrade to ${getPlanName(plan)} to add it to your pages.`
								: "It isn't included in any plan yet."}
						</DialogDescription>
					</DialogHeader>
					{plan && (
						<DialogFooter>
							<UpgradeAction />
						</DialogFooter>
					)}
				</DialogContent>
			</Dialog>
		</BlockAccessContext>
	);
}

/** `large` is for the canvas, which shows the page scaled down. */
function TileBody({
	tile,
	large = false,
}: {
	tile: DrawerTile;
	large?: boolean;
}) {
	return (
		<>
			<div
				aria-hidden
				className={cn(
					"aspect-4/3 overflow-hidden rounded-md bg-muted",
					tile.lockedBy && "opacity-50",
				)}
			>
				{SKETCHES[tile.type as BlockType]}
			</div>
			<div className="grid gap-0.5 px-0.5">
				<span
					className={cn(
						"flex items-center gap-1 font-medium",
						large ? "text-lg" : "text-xs",
					)}
				>
					{tile.lockedBy && (
						<LockIcon
							aria-hidden
							className={cn("shrink-0", large ? "size-4" : "size-3")}
						/>
					)}
					{tile.label}
				</span>
				<span
					className={cn(
						"text-muted-foreground leading-snug",
						large ? "text-base" : "text-[11px]",
					)}
				>
					{tile.lockedBy ? "Upgrade to use" : tile.description}
				</span>
			</div>
		</>
	);
}

const tileClass =
	"grid content-start gap-1.5 rounded-lg border bg-card p-1.5 text-left shadow-xs transition-colors";

function LockedTile({
	tile,
	large = false,
}: {
	tile: DrawerTile;
	large?: boolean;
}) {
	const { askToUpgrade } = use(BlockAccessContext);
	return (
		<button
			type="button"
			className={cn(
				tileClass,
				"cursor-pointer outline-none hover:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring/40",
			)}
			aria-label={`${tile.label}: upgrade to use`}
			onClick={() => askToUpgrade(tile)}
		>
			<TileBody tile={tile} large={large} />
		</button>
	);
}

function DrawerCard({ type }: { type: string }) {
	const { groups } = use(BlockAccessContext);
	const { add } = useBlockActions();
	const tile = tileFor(groups, type);
	if (!tile) return <div />;
	/** `Drawer.Item` renders its content twice; the copy left behind while dragging is hidden from screen readers. */
	const hideBackgroundCopy = (element: HTMLDivElement | null) => {
		const copy = element?.closest<HTMLElement>('[class*="Drawer-draggableBg"]');
		if (copy) copy.inert = true;
	};
	return (
		<div
			ref={hideBackgroundCopy}
			className={cn(tileClass, "cursor-grab hover:border-ring/40")}
		>
			<TileBody tile={tile} />
			<Button
				size="xs"
				variant="outline"
				aria-label={`Add ${tile.label}`}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={() => add(type)}
			>
				<PlusIcon aria-hidden /> Add
			</Button>
		</div>
	);
}

const renderDrawerCard = ({ name }: { name: string }) => (
	<DrawerCard type={name} />
);

/** The Add panel: each group's blocks as cards to drag onto the page or add with a click. */
export function BlockDrawer() {
	const { groups } = use(BlockAccessContext);
	return (
		<div className="grid gap-5">
			{groups.map((group) => (
				<section key={group.group} className="grid gap-2">
					<h3 className="font-medium text-muted-foreground text-xs">
						{group.title}
					</h3>
					<Drawer>
						<div className="isolate grid grid-cols-2 gap-2">
							{group.tiles.map((tile) =>
								tile.lockedBy ? (
									<LockedTile key={tile.type} tile={tile} />
								) : (
									<Drawer.Item
										key={tile.type}
										name={tile.type}
										label={tile.label}
									>
										{renderDrawerCard}
									</Drawer.Item>
								),
							)}
						</div>
					</Drawer>
				</section>
			))}
		</div>
	);
}

/** An empty page's start: the ready-made blocks, added with a click. */
export function FirstRunBlocks() {
	const { groups } = use(BlockAccessContext);
	const { add } = useBlockActions();
	const ready = groups.find((group) => group.group === "ready")?.tiles ?? [];
	return (
		<div className="mx-auto grid w-full max-w-5xl gap-8 py-16 text-center">
			<div className="grid gap-1">
				<p className="font-heading font-semibold text-3xl">
					Start with a ready-made block
				</p>
				<p className="text-lg text-muted-foreground">
					Pick one to add it, or drag any block from the Add panel.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{ready.map((tile) =>
					tile.lockedBy ? (
						<LockedTile key={tile.type} tile={tile} large />
					) : (
						<button
							key={tile.type}
							type="button"
							aria-label={`Add ${tile.label}`}
							className={cn(
								tileClass,
								"cursor-pointer outline-none hover:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring/40",
							)}
							onClick={(event) => {
								// a click on the canvas's empty root would deselect the new block
								event.stopPropagation();
								add(tile.type);
							}}
						>
							<TileBody tile={tile} large />
						</button>
					),
				)}
			</div>
		</div>
	);
}
