import { db as mainDb } from "./driver";

// SQLite doesn't support separate databases for logs in the same way as Postgres
// Always use the main database connection for SQLite
export const logsDb = mainDb;
export default logsDb;
export const primaryLogsDb = logsDb;