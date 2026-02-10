# Mux CLI

## Project Overview
The goal of this CLI is to create a first class experience of the Mux API. Primarily it should provide a path to help developers develop locally with Mux, but it can also be used to interact with the Mux API itself to take basic actions.

## Development
The project should use Bun as the JavaScript runtime. It should be written in TypeScript and use Bun's TypeScript compiler. The project should be structured using Bun's module system and should be able to export a binary executable.

### Guidelines
- Use professional language and tone for anything that's project or customer facing. This includes documentation, error messages, commit messages, and code comments.
- Always prefer native fetch over tools like Axios or Superagent for HTTP requests.
- Use pnpm for package management.
- Use Bun's module system for importing and exporting modules.
- Use Bun's TypeScript compiler for type checking and transpiling TypeScript code to JavaScript.
- Follow Bun's best practices for code organization and maintainability.
- Use [Cliffy](https://cliffy.io/docs@v1.0.0-rc.8) for the command line interfaces (for Bun you'll need to use the [JSR package](https://github.com/oven-sh/jsr))
- Use the Mux Node SDK for interacting with the Mux API.
- Otherwise, make an effort to limit 3rd party dependencies and prefer std libraries.
- Always work on features in a branch separate from main/master.
- Keep commits small and focused.
- Write tests FIRST, testing the interfaces you plan to build, then let's review those together. You can add tests later for utilities that pop up along the way of implementation.
- Run `pnpm exec check` consistently to check for code quality, etc.

### Workflow
When starting a new task, create a new branch if necessary, and a plan file in the `plans/` directory named with a date prefix (e.g. `plans/2025-01-15-feature-name.md`). Keep that file updated with TODOs, observations, and plans as you work. When starting a new session, review the most recent plan file in `plans/` if one exists before beginning.

Ask me to review your plan before starting work.

When a feature is completely finished, move all notes that should be retained long term to the appropriate section of the `NOTES.md` file.

## Mux Documentation
Whenever there are questions about Mux functionality, refer to the [Mux Documentation](https://docs.mux.com/).
