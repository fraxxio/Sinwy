import { useEffect, useState } from "react";
import { Img } from "@/shared/components/Img";

const images = [1, 2, 3, 4].map((n) => `/images/authbg${n}.jpg`);

export const AuthLayout = ({ children }: { children: React.ReactNode }) => {
	const [active, setActive] = useState(0);

	useEffect(() => {
		const id = setInterval(
			() => setActive((i) => (i + 1) % images.length),
			10000,
		);
		return () => clearInterval(id);
	}, []);

	return (
		<main className="page-wrap grid gap-6 py-10 lg:min-h-[calc(100svh-12rem)] lg:grid-cols-2 items-center">
			<div className="w-full max-w-sm ">{children}</div>
			<div className="relative hidden overflow-hidden rounded-2xl bg-muted lg:block h-full">
				{images.map((src, i) => (
					<Img
						key={src}
						src={src}
						alt="Authentication illustration"
						className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
							i === active ? "opacity-100" : "opacity-0"
						}`}
					/>
				))}
			</div>
		</main>
	);
};
