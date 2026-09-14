import type { Permission } from "@sinwy/shared";
import type { SidebarNavItem } from "#/shared/components/shell/SidebarNav";

/**
 * Keeps items whose permission `can` grants (or that declare none). A group
 * survives only with at least one visible sub-item.
 */
export const filterNav = (
	items: SidebarNavItem[],
	can: (permission: Permission) => boolean,
): SidebarNavItem[] =>
	items.flatMap((item): SidebarNavItem[] => {
		if (!item.items)
			return item.permission === undefined || can(item.permission)
				? [item]
				: [];

		const subItems = item.items.filter(
			(subItem) => subItem.permission === undefined || can(subItem.permission),
		);
		return subItems.length > 0 ? [{ ...item, items: subItems }] : [];
	});
