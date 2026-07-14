// Loaded via vitest.config.ts's `setupFiles`, before any test file (and
// therefore before `AppModule`/`ConfigModule.forRoot`'s eager Zod
// validation) is imported — module imports are hoisted ahead of any
// in-file `beforeAll`, so setting these there would be too late.
// Matches docs/CI_CD.md's backend-tests job exactly, so the same value
// works locally (against a matching local Postgres role/db) and in CI.
process.env.DATABASE_URL ??= "postgresql://postgres:test@localhost:5432/test";
process.env.AUTH_JWT_SECRET ??= "test-secret-at-least-32-characters-long";
// Real deployed addresses (`deployed-addresses.testnet.json`), not dummy
// placeholders. STELLAR_FACTORY_CONTRACT_ADDRESS was a dummy
// (`"C" + "A".repeat(55)`) through Step 12 since no test path called
// `payroll_factory` directly — treasury.e2e-spec.ts and
// employees.e2e-spec.ts create/resolve organizations via
// test/helpers/testnet-fixtures.ts's own hardcoded factory address
// instead. organizations.e2e-spec.ts (Step 14) now builds real
// `create_organization` calls through `OrganizationsChainAdapter`, which
// reads this from config, so it must be real too. USDC_SAC is passed as a
// real `Address` argument to `register_employee` (EmployeesChainAdapter),
// and employee_registry is a network-wide singleton read from config
// (unlike treasury's per-org address, resolved from the DB) — both must
// be real for Step 10's e2e tests to build valid on-chain calls.
process.env.STELLAR_FACTORY_CONTRACT_ADDRESS ??= "CD2GIPUVLMB36V6XLTN7KJ6CGJOSUWRTLSC2WAGIXDJLPCTZF657JLX3";
process.env.STELLAR_USDC_SAC_ADDRESS ??= "CBKL4AWQPCWLDVDZ4MPYM4AWLDEKBU3KUTDVQ7AGW77P6KR23YIIUTNL";
process.env.STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS ??= "CB3G6PXAKCEZAB6W2P27LY7UMZBL6YMD6ZUP4Q2HCKRRZIWERB2H7AML";
process.env.STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS ??= "CANMOFXMXPPGOVXK4ISAM4R75ESFFDWGKAZG2S4W4JTWKD2BMMNLPYVZ";
process.env.STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS ??= "CD3XEYY3J7HPQLJSY64LIQC6R7OXG6N2WNTHSWQTXCXNI3ZYQI2V2R5B";
