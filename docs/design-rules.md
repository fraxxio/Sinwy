# Bun REST API Architecture Guidelines

## Goals

* Keep the backend simple and maintainable
* Organize code by business capability (modules)
* Keep HTTP concerns separate from business logic
* Scale gradually without premature complexity
* Use explicit dependencies and clear ownership

---

# High-Level Architecture

```text
HTTP Request
    ↓
Middleware
    ↓
Route Handler / Controller
    ↓
Service / Use Case
    ↓
Repository
    ↓
Database
```

---

# Core Architectural Principles

## 1. Use a Modular Monolith

Organize the application into modules.

Each module owns:

* routes
* controllers
* business logic
* validation
* persistence
* DTOs
* errors

Modules represent business domains.

Examples:

* users
* auth
* posts
* comments
* notifications

---

## 2. Separate by Feature, NOT by Technical Type

Avoid:

```text
/controllers
/services
/repositories
```

Prefer:

```text
modules/
├── users/
├── posts/
├── auth/
```

This keeps related code together.

---

## 3. Keep Route Handlers Thin

Route handlers should only:

1. parse request
2. validate input
3. call service
4. return response

Route handlers should NOT:

* contain business logic
* perform complex DB queries
* contain authorization rules
* orchestrate multiple systems

Example:

```ts
export async function createPost(c: Context) {
	const body = createPostSchema.parse(
		await c.req.json(),
	);

	const post = await postsService.create(body);

	return Response.json(post, {
		status: 201,
	});
}
```

---

## 4. Business Logic Lives in Services

Services are the core of the application.

Services contain:

* business rules
* orchestration
* transactions
* permission checks
* workflow coordination

Services should NOT:

* know about HTTP
* return HTTP responses
* contain transport concerns

Example:

```ts
export async function create(input: CreatePostDto) {
	const user = await usersService.getById(
		input.authorId,
	);

	if (!user) {
		throw new NotFoundError("User not found");
	}

	return postsRepository.create(input);
}
```

---

## 5. Repositories Only Access the Database

Repositories:

* contain DB queries
* use Drizzle
* return DB entities

Repositories should NOT:

* contain business logic
* perform validation
* return HTTP DTOs

Example:

```ts
export async function findById(id: number) {
	return db.query.users.findFirst({
		where: eq(users.id, id),
	});
}
```

---

# Recommended File Structure

## Application Structure

```text
src/
├── app/
│   ├── create-app.ts
│   ├── router.ts
│   ├── middleware/
│   └── server.ts
│
├── modules/
│   ├── auth/
│   ├── users/
│   ├── posts/
│   └── comments/
│
├── lib/
│   ├── errors/
│   ├── logger/
│   ├── validation/
│   ├── utils/
│   └── types/
│
├── db/
│   ├── client.ts
│   ├── schema/
│   └── migrations/
│
└── index.ts
```

---

## Module Structure (Small/Medium Modules)

```text
posts/
├── routes.ts
├── controller.ts
├── service.ts
├── repository.ts
├── dto.ts
├── mapper.ts
├── schemas.ts
├── errors.ts
├── types.ts
└── index.ts
```

---

## Large Module Structure

When modules grow large:

```text
posts/
├── routes.ts
├── controller/
├── services/
├── repository/
├── schemas/
├── dto/
├── mappers/
└── use-cases/
```

Split only when complexity justifies it.

---

# DTOs and Mappers

## DTO Purpose

DTOs define:

* API request shapes
* API response shapes

DTOs are NOT database entities.

Example:

```ts
export type UserDto = {
	id: number;
	email: string;
};
```

---

## Use Drizzle Types for DB Entities

```ts
export type DbUser = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

Use these internally.

---

## Mapper Purpose

Mappers convert:

```text
DB entity → API DTO
```

Example:

```ts
export function toUserDto(user: DbUser): UserDto {
	return {
		id: user.id,
		email: user.email,
	};
}
```

---

## Mapping Rule

Repositories return DB entities.

Controllers map entities into DTOs.

Example:

```ts
const user = await usersService.getById(id);

return Response.json(toUserDto(user));
```

---

# Validation

Use Zod for validation.

Example:

```ts
export const createPostSchema = z.object({
	title: z.string().min(1),
	content: z.string(),
});
```

Infer DTOs from schemas:

```ts
export type CreatePostDto = z.infer<
	typeof createPostSchema
>;
```

---

# Middleware Rules

Middleware should contain:

* logging
* auth
* CORS
* metrics
* tracing
* request IDs
* error handling

Middleware should NOT contain:

* feature-specific business logic
* module orchestration

---

# Error Handling

Use typed application errors.

Example:

```ts
export class NotFoundError extends Error {}
export class UnauthorizedError extends Error {}
```

Use centralized error middleware.

---

# Module Communication Rules

## Modules ARE Allowed to Communicate

Modules may import:

* services
* DTOs
* public types
* public validators

Example:

```ts
import { usersService } from "@/modules/users";
```

---

## Modules Should Expose Public APIs

Each module should export public APIs through `index.ts`.

Example:

```ts
export * as usersService from "./service";

export type {
	UserDto,
	CreateUserDto,
} from "./dto";
```

Other modules should import only from:

```ts
@/modules/users
```

---

## Avoid Deep Imports

Avoid:

```ts
import { helper } from
"@/modules/users/internal/helper";
```

Use public module exports instead.

---

## Avoid Circular Dependencies

Good:

```text
auth → users
posts → users
comments → users
```

Bad:

```text
users → auth
auth → users
```

Dependencies should flow in one direction.

---

## Do NOT Access Other Module Repositories Directly

Avoid:

```ts
postsService → usersRepository
```

Prefer:

```ts
postsService → usersService
```

This preserves module boundaries and business rules.

---

# Auth Architecture

## Auth Should Be Its Own Module

Authentication is separate from user domain logic.

Recommended:

```text
modules/
├── auth/
└── users/
```

---

## Auth Module Responsibilities

* login
* logout
* sessions
* tokens
* OAuth
* password verification
* auth middleware
* refresh tokens

---

## Users Module Responsibilities

* user profiles
* user CRUD
* user settings
* permissions
* business rules

---

## Dependency Direction

Good:

```text
auth → users
```

Avoid:

```text
users → auth
```

---

# Dependency Injection

Keep DI simple.

Prefer:

```ts
export const postsService = createPostsService({
	postsRepository,
	usersService,
});
```

Avoid enterprise DI containers early.

---

# Functional Style

Prefer plain functions and objects.

Example:

```ts
export async function createPost() {}
```

Avoid unnecessary classes.

---

# Shared Folder Rules

`lib/` should contain:

* framework implementation
* logger
* shared errors
* utilities
* config
* reusable validation
* common helpers

Do NOT place business logic in `shared/`.

---

# Scaling Rules

## Split Files Gradually

Do NOT start with:

```text
100 tiny files
```

Start simple.

Split only when:

* files become large
* complexity grows
* ownership becomes unclear

---

## Avoid Utility Hell

Avoid giant generic utility folders.

Prefer colocating helpers near modules.

---

## Avoid Premature Complexity

Do NOT introduce early:

* microservices
* CQRS
* event sourcing
* heavy DDD
* repository abstractions everywhere
* service interfaces everywhere

Keep architecture boring and explicit.

---

# Recommended Tech Stack

* Runtime: Bun
* Validation: Zod
* ORM: Drizzle ORM
* Logging: console or Pino
* Testing: bun test

---

# Summary

## Architecture Style

```text
Modular Monolith
+ Thin Controllers
+ Service Layer
+ Repository Layer
+ DTO Mapping
+ Schema Validation
+ Functional Style
```

## Main Rules

* organize by modules
* keep handlers thin
* business logic belongs in services
* repositories only access DB
* use DTOs for API contracts
* expose module public APIs through index.ts
* avoid circular dependencies
* avoid deep imports
* avoid premature complexity
* scale gradually
