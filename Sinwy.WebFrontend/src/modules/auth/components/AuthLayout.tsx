export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
	return (
		<main className="page-wrap grid gap-6 py-10 lg:min-h-[calc(100svh-12rem)] lg:grid-cols-2 items-center">
			<div className="w-full max-w-sm ">{children}</div>
			{/* ponytail: blank illustration placeholder, swap for real artwork later */}
			<div className="hidden rounded-2xl bg-muted lg:block h-full" />
		</main>
	);
};
