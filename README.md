mux-cli
=======

Your friendly neighborhood Mux CLI tool

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/mux-cli.svg)](https://npmjs.org/package/mux-cli)
[![Downloads/week](https://img.shields.io/npm/dw/mux-cli.svg)](https://npmjs.org/package/mux-cli)
[![License](https://img.shields.io/npm/l/mux-cli.svg)](https://github.com/muxinc/cli/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g mux-cli
$ mux COMMAND
running command...
$ mux (-v|--version|version)
mux-cli/0.0.0 darwin-x64 node-v10.14.2
$ mux --help [COMMAND]
USAGE
  $ mux COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mux assets [FILE]`](#mux-assets-file)
* [`mux assets:create [FILE]`](#mux-assetscreate-file)
* [`mux hello [FILE]`](#mux-hello-file)
* [`mux help [COMMAND]`](#mux-help-command)

## `mux assets [FILE]`

describe the command here

```
USAGE
  $ mux assets [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ mux hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/assets.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/assets.ts)_

## `mux assets:create [FILE]`

describe the command here

```
USAGE
  $ mux assets:create [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print
```

_See code: [src/commands/assets/create.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/assets/create.ts)_

## `mux hello [FILE]`

describe the command here

```
USAGE
  $ mux hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ mux hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/hello.ts)_

## `mux help [COMMAND]`

display help for mux

```
USAGE
  $ mux help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.1.4/src/commands/help.ts)_
<!-- commandsstop -->
