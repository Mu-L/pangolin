# Database

Pangolin can use a Postgres or SQLite database to store its data.

## Development

### Postgres

To use Postgres, edit `server/db/index.ts` to export all from `server/db/pg/index.ts`:

```typescript
export * from "./pg";
```

Make sure you have a valid config file with a connection string:

```yaml
postgres:
    connection_string: postgresql://postgres:postgres@localhost:5432
```

You can run an ephemeral Postgres database for local development using Docker:

```bash
docker run -d \
  --name postgres \
  --rm \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -v $(mktemp -d):/var/lib/postgresql/data \
  postgres:17
```

### Schema

`server/db/pg/schema.ts` and `server/db/sqlite/schema.ts` contain the database schema definitions. These need to be kept in sync with with each other.

Stick to common data types and avoid Postgres-specific features to ensure compatibility with SQLite.

### SQLite

To use SQLite, edit `server/db/index.ts` to export all from `server/db/sqlite/index.ts`:

```typescript
export * from "./sqlite";
```

No edits to the config are needed. If you keep the Postgres config, it will be ignored.

## Generate and Push Migrations

Ensure drizzle-kit is installed.

### Postgres

You must have a connection string in your config file, as shown above.

```bash
npm run db:generate
npm run db:push
```

### SQLite

```bash
npm run db:generate
npm run db:push
```

## Build Time

There is a dockerfile for each database type. The dockerfile swaps out the `server/db/index.ts` file to use the correct database type.
