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
mux-cli/0.0.0 darwin-x64 node-v11.6.0
$ mux --help [COMMAND]
USAGE
  $ mux COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`mux assets:base`](#mux-assetsbase)
* [`mux assets:create INPUT`](#mux-assetscreate-input)
* [`mux assets:upload PATH`](#mux-assetsupload-path)
* [`mux help [COMMAND]`](#mux-help-command)
* [`mux init`](#mux-init)
* [`mux sign PLAYBACK-ID`](#mux-sign-playback-id)

## `mux assets:base`

```
USAGE
  $ mux assets:base

OPTIONS
  -p, --private  add a private playback policy to the created asset
```

_See code: [src/commands/assets/base.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/assets/base.ts)_

## `mux assets:create INPUT`

Create a new asset in Mux using a file that's already available online

```
USAGE
  $ mux assets:create INPUT

ARGUMENTS
  INPUT  input URL for the file you'd like to create this asset from

OPTIONS
  -p, --private  add a private playback policy to the created asset
```

_See code: [src/commands/assets/create.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/assets/create.ts)_

## `mux assets:upload PATH`

Create a new asset in Mux via a local file

```
USAGE
  $ mux assets:upload PATH

ARGUMENTS
  PATH  local path for the file you'd like to create this asset from

OPTIONS
  -p, --private  add a private playback policy to the created asset
```

_See code: [src/commands/assets/upload.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/assets/upload.ts)_

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

## `mux init`

set up a user-level config

```
USAGE
  $ mux init
```

_See code: [src/commands/init.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/init.ts)_

## `mux sign PLAYBACK-ID`

Creates a new signed URL token for a playback ID

```
USAGE
  $ mux sign PLAYBACK-ID

ARGUMENTS
  PLAYBACK-ID  Playback ID to create a signed URL token for.
```

_See code: [src/commands/sign.ts](https://github.com/muxinc/cli/blob/v0.0.0/src/commands/sign.ts)_
<!-- commandsstop -->
