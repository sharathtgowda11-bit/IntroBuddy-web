export { getPool } from "./pool.js";
export { withTenant } from "./withTenant.js";

// Test-only fixture helpers, reused by this package's own tests and by
// other workspace packages' integration tests (e.g. apps/api) so raw
// fixture SQL lives in exactly one place.
export {
  APP_URL,
  SUPERUSER_URL,
  createFixtureCollegeUser,
  createFixtureDepartment,
  createFixtureIdentity,
  createFixtureTenant,
  fixtureExpiry,
  fixtureTokenHash,
  uniqueSuffix,
  type FixtureCollegeUser,
  type FixtureTenant,
} from "./testFixtures.js";
