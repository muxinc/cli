# Mux CLI

## Project Overview
The goal of this CLI is to create a first class experience of the Mux API. Primarily it should provide a path to help developers develop locally with Mux, but it can also be used to interact with the Mux API itself to take basic actions.

## Development
The project should use Bun as the JavaScript runtime. It should be written in TypeScript and use Bun's TypeScript compiler. The project should be structured using Bun's module system and should be able to export a binary executable.

### Guidelines
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

### Workflow
When starting a new task, create a new branch if necessary, and a `PLAN.md` file. Keep that file updated with TODOs and plans as you work. When starting a new session, review an existing `PLAN.md` file if it exists before beginning.

## Mux Documentation
Whenever there are questions about Mux functionality, refer to the [Mux Documentation](https://docs.mux.com/).
