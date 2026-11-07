import {
	API_ERROR_CODES,
	BOOKING_LIMITS,
	type CustomerBookingDto,
	type PublicServiceDto,
	type StorefrontDto,
} from "@sinwy/shared";
import {
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { ArrowLeftIcon, StoreIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { BookingSuccess } from "#/modules/storefront/components/BookingSuccess";
import {
	type ConfirmError,
	ConfirmStep,
	type ConfirmValues,
} from "#/modules/storefront/components/ConfirmStep";
import { ServiceList } from "#/modules/storefront/components/ServiceList";
import {
	createSelfBooking,
	storefrontKeys,
	storefrontQuery,
	storefrontTimesQuery,
} from "#/modules/storefront/lib/storefront-queries";
import { BookableTimesPicker } from "#/shared/components/booking/BookableTimesPicker";
import { EmptyState } from "#/shared/components/EmptyState";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { authClient } from "#/shared/lib/auth/auth-client";
import { addDaysToDate, localDateOf, todayIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

// a stale or hand-edited value drops back a step instead of failing the page
const searchSchema = z.object({
	service: z.string().min(1).optional().catch(undefined),
	date: z.iso.date().optional().catch(undefined),
	start: z.iso.datetime({ offset: true }).optional().catch(undefined),
});

export const Route = createFileRoute("/$organizationSlug/book")({
	ssr: false,
	validateSearch: searchSchema,
	loader: ({ params, context }) =>
		context.queryClient.ensureQueryData(
			storefrontQuery(params.organizationSlug),
		),
	component: BookPage,
});

function BookPage() {
	const { organizationSlug: slug } = Route.useParams();
	const { data: storefront } = useSuspenseQuery(storefrontQuery(slug));
	const [booked, setBooked] = useState<CustomerBookingDto | null>(null);
	const navigate = Route.useNavigate();

	if (!storefront)
		return (
			<EmptyState
				icon={<StoreIcon />}
				title="This booking page isn't available"
				description="The link may be wrong, or the business isn't taking bookings on Sinwy right now."
			/>
		);

	const { organization } = storefront;
	const place = [organization.city, organization.country]
		.filter(Boolean)
		.join(", ");
	return (
		<div className="mx-auto w-full max-w-2xl space-y-8">
			<header className="space-y-1">
				<h1 className="font-semibold text-3xl">{organization.name}</h1>
				{organization.tagline && (
					<p className="text-muted-foreground">{organization.tagline}</p>
				)}
				{place && <p className="text-muted-foreground text-sm">{place}</p>}
			</header>
			{booked ? (
				<BookingSuccess
					booking={booked}
					onBookAnother={() => setBooked(null)}
				/>
			) : (
				<BookingSteps
					slug={slug}
					storefront={storefront}
					onBooked={(booking) => {
						setBooked(booking);
						void navigate({ search: {}, replace: true });
					}}
				/>
			)}
		</div>
	);
}

function BookingSteps({
	slug,
	storefront,
	onBooked,
}: {
	slug: string;
	storefront: StorefrontDto;
	onBooked: (booking: CustomerBookingDto) => void;
}) {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const service = storefront.services.find(({ id }) => id === search.service);

	if (!service)
		return (
			<Step title="Choose a service">
				<ServiceList
					services={storefront.services}
					onPick={(serviceId) =>
						void navigate({ search: { service: serviceId } })
					}
				/>
			</Step>
		);

	const backToServices = () => void navigate({ search: {} });
	if (!search.start)
		return (
			<Step title="Pick a time" onBack={backToServices} service={service}>
				<TimeStep slug={slug} storefront={storefront} service={service} />
			</Step>
		);

	return (
		<Step
			title="Confirm"
			onBack={() =>
				void navigate({ search: (prev) => ({ ...prev, start: undefined }) })
			}
		>
			<Confirm
				slug={slug}
				storefront={storefront}
				service={service}
				startsAt={search.start}
				onBooked={onBooked}
			/>
		</Step>
	);
}

function Step({
	title,
	service,
	onBack,
	children,
}: {
	title: string;
	service?: PublicServiceDto;
	onBack?: () => void;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-4">
			<div className="flex items-center gap-2">
				{onBack && (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Back"
						onClick={onBack}
					>
						<ArrowLeftIcon />
					</Button>
				)}
				<h2 className="font-semibold text-xl">{title}</h2>
			</div>
			{service && (
				<p className="text-muted-foreground text-sm">
					{service.name} · {service.durationMinutes} min ·{" "}
					{formatMinorUnits(service.priceMinor, service.currency)}
				</p>
			)}
			{children}
		</section>
	);
}

function TimeStep({
	slug,
	storefront,
	service,
}: {
	slug: string;
	storefront: StorefrontDto;
	service: PublicServiceDto;
}) {
	const { date: picked } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { timezone } = storefront.organization;
	const first = todayIn(timezone);
	const last = addDaysToDate(first, BOOKING_LIMITS.selfBookingDays);
	const date = picked && picked >= first && picked <= last ? picked : first;
	const times = useQuery(storefrontTimesQuery(slug, service.id, date));

	return (
		<div className="space-y-2">
			<BookableTimesPicker
				timezone={timezone}
				date={date}
				minDate={first}
				maxDate={last}
				onDateChange={(next) =>
					void navigate({
						search: (prev) => ({ ...prev, date: next }),
						replace: true,
					})
				}
				times={times.data?.times ?? []}
				value={null}
				onChange={(start) =>
					void navigate({ search: (prev) => ({ ...prev, date, start }) })
				}
				loading={times.isPending}
			/>
			{times.isError && <FieldError>{times.error.message}</FieldError>}
		</div>
	);
}

function Confirm({
	slug,
	storefront,
	service,
	startsAt,
	onBooked,
}: {
	slug: string;
	storefront: StorefrontDto;
	service: PublicServiceDto;
	startsAt: string;
	onBooked: (booking: CustomerBookingDto) => void;
}) {
	const navigate = Route.useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const { organization } = storefront;

	const toLogin = () =>
		navigate({ to: "/auth/login", search: { redirect: location.href } });

	const confirm = async (
		values: ConfirmValues,
	): Promise<ConfirmError | null> => {
		if (!session) {
			await toLogin();
			return null;
		}
		const res = await createSelfBooking(slug, {
			serviceId: service.id,
			startsAt,
			...values,
		});
		if (res.isSuccess) {
			void queryClient.invalidateQueries({
				queryKey: storefrontKeys.all(slug),
			});
			onBooked(res.data);
			return null;
		}
		if (res.code === 401) {
			await toLogin();
			return null;
		}
		const timeGone = res.code === API_ERROR_CODES.BOOKING_TIME_TAKEN;
		if (timeGone)
			void queryClient.invalidateQueries({
				queryKey: storefrontKeys.all(slug),
			});
		return { message: res.message, timeGone };
	};

	return (
		<ConfirmStep
			service={service}
			startsAt={startsAt}
			timezone={organization.timezone}
			organizationName={organization.name}
			onConfirm={confirm}
			onPickAnotherTime={() =>
				void navigate({
					search: (prev) => ({
						...prev,
						date: localDateOf(startsAt, organization.timezone),
						start: undefined,
					}),
				})
			}
		/>
	);
}
