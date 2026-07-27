import type { ComponentType } from "react";
import { cn } from "#/shared/lib/utils";
import { GoogleIcon } from "./custom";

export type IconProps = {
	className?: string | undefined;
	"aria-hidden"?: boolean | undefined;
	"aria-label"?: string | undefined;
};

export type IconComponent = ComponentType<IconProps>;

export function imageIcon(src: string, alt = ""): IconComponent {
	return function ImageIcon({ className, ...props }) {
		return (
			<img
				src={src}
				alt={alt}
				loading="eager"
				decoding="sync"
				draggable={false}
				className={cn("size-4 shrink-0", className)}
				{...props}
			/>
		);
	};
}

export const icons = {
	google: GoogleIcon,
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof icons;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
	const Component = icons[name];
	return (
		<Component aria-hidden={props["aria-label"] === undefined} {...props} />
	);
}
