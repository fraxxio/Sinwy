import {
	refreshSession,
	type SessionUser,
} from "#/modules/account-dashboard/lib/account-queries";
import { ImageUpload } from "#/shared/components/ImageUpload";
import { initials } from "#/shared/components/shell/display-name";

export function AvatarUpload({ user }: { user: SessionUser }) {
	return (
		<ImageUpload
			path="/user/avatar"
			image={user.image ?? null}
			alt={user.name}
			fallback={initials(user.name || user.email)}
			onChange={refreshSession}
		/>
	);
}
