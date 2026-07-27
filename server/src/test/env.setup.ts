/**
 * Test environment.
 *
 * These are placeholders, not credentials. The tests in this suite exercise
 * pure logic — money arithmetic, the trading-day calendar, error translation,
 * the order state machine — and never open a connection, so the DATABASE_URL
 * only has to satisfy the schema in config/env.ts.
 *
 * Set before anything imports the config, because that module validates
 * process.env at load time and exits the process when it does not match.
 *
 * REPORT_TIMEZONE is pinned rather than defaulted: the report tests assert on
 * specific day boundaries, and a suite whose expectations move with the
 * machine's locale is a suite that fails only on someone else's laptop.
 */

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test-jwt-secret-that-is-long-enough-for-zod";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-long-enough!!";
process.env.REPORT_TIMEZONE ??= "Asia/Kolkata";
