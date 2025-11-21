# Project Notes

This file should be an ongoing collection of working notes for working with this codebase, primarily maintained by Claude.

## Claude.md suggestions

## Codebase

### Authentication & Environment Management

**Configuration Storage**
- Credentials be stored in `~/.config/mux/config.json` with secure file permissions (0o600)
- Config directory created with 0o700 permissions fer added security
- Multiple named environments supported (e.g., "production", "staging", "development")
- First environment added automatically becomes the default
- Default environment can be switched with `mux env switch <name>`

**Credential Validation**
- The `validateCredentials()` function in `/Users/mmcc/Projects/muxinc/cli/src/lib/mux.ts` validates credentials by makin' a lightweight API call to Mux (list assets with limit=1)
- Credentials be validated BEFORE bein' saved to config to prevent invalid credentials from polluting the config
- Error messages provide clear guidance fer common authentication failures (401, 403)
- Note: This function currently lacks test coverage but was manually verified. Future enhancement: add unit tests with mocked Mux API responses.

**Default Environment Logic**
- When removin' the default environment, the system automatically selects the first remaining environment as the new default
- When removin' the last environment, defaultEnvironment be set to undefined
- When only one environment exists, it's automatically used regardless of defaultEnvironment setting

**Bun Compatibility**
- Fixed `Deno.exit` → `process.exit` fer proper Bun runtime support
- All file operations use native Node.js APIs compatible with Bun

### Command Structure

**Cliffy Best Practices**
- Action handlers registered BEFORE command registration (`.action().then command()`)
- Commands use `allowEmpty: false` by default fer required arguments
- Error messages include helpful guidance fer next steps

### Testing Strategy

**Current Coverage (46 tests passin')**
- Unit tests fer `parseEnvFile()` - comprehensive coverage of .env file parsing edge cases
- Unit tests fer all config management functions (read, write, get, set, remove, list)
- Tests use temporary directories and clean up after themselves
- Tests avoid sleep() and timing dependencies
- Tests favor readability over extreme DRY patterns

**Notable Test Gap**
- `validateCredentials()` function has no test coverage (requires mockin' Mux API)
- CLI command integration tests be minimal (commands be thin wrappers around tested functions)
- Manual testing performed and documented in PLAN.md

## Workflow

### Feature Development Pattern
When implementin' new features:
1. Create a `PLAN.md` file with goals, architecture, and TODOs
2. Write tests FIRST fer core functionality
3. Implement features incrementally, updatin' PLAN.md with observations
4. Perform manual end-to-end testing
5. When complete, migrate relevant notes to NOTES.md and remove PLAN.md

### Branch Strategy
- Work on features in separate branches (e.g., `mmcc/revamp`)
- Keep commits small and focused
- Main branch be `master` (not `main`)

## Global TODOs

### Future Enhancements
- Add unit tests fer `validateCredentials()` with mocked Mux API responses
- Consider adding integration tests fer CLI commands if complexity increases
- Evaluate need fer credential refresh/expiration handling
