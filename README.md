# mux-cli

Your friendly neighborhood Mux CLI tool

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@mux/cli.svg)](https://npmjs.org/package/@mux/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@mux/cli.svg)](https://npmjs.org/package/@mux/cli)
[![License](https://img.shields.io/npm/l/@mux/cli.svg)](https://github.com/muxinc/cli/blob/master/package.json)

<!-- toc -->
* [mux-cli](#mux-cli)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @mux/cli
$ mux COMMAND
running command...
$ mux (-v|--version|version)
@mux/cli/0.5.0 linux-x64 node-v13.9.0
$ mux --help [COMMAND]
USAGE
  $ mux COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`mux assets:create INPUT`](#mux-assetscreate-input)
* [`mux assets:upload PATH`](#mux-assetsupload-path)
* [`mux autocomplete [SHELL]`](#mux-autocomplete-shell)
* [`mux commands`](#mux-commands)
* [`mux help [COMMAND]`](#mux-help-command)
* [`mux init [ENVFILE]`](#mux-init-envfile)
* [`mux live:complete STREAMNAME`](#mux-livecomplete-streamname)
* [`mux live:disable STREAMNAME`](#mux-livedisable-streamname)
* [`mux live:enable STREAMNAME`](#mux-liveenable-streamname)
* [`mux sign PLAYBACK-ID`](#mux-sign-playback-id)
* [`mux update [CHANNEL]`](#mux-update-channel)

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

_See code: [src/commands/assets/create.ts](https://github.com/muxinc/cli/blob/master/src/commands/assets/create.ts)_

## `mux assets:upload PATH`

Create a new asset in Mux via a local file

```
USAGE
  $ mux assets:upload PATH

ARGUMENTS
  PATH  local path for the file (or folder) you'd like to upload

OPTIONS
  -c, --concurrent=concurrent  [default: 3] max number of files to upload at once
  -f, --filter=filter          regex that filters the selected destination if the provided path is a folder
  -p, --private                add a private playback policy to the created asset
```

_See code: [src/commands/assets/upload.ts](https://github.com/muxinc/cli/blob/master/src/commands/assets/upload.ts)_

## `mux autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ mux autocomplete [SHELL]

ARGUMENTS
  SHELL  shell type

OPTIONS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

EXAMPLES
  $ mux autocomplete
  $ mux autocomplete bash
  $ mux autocomplete zsh
  $ mux autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v0.2.0/src/commands/autocomplete/index.ts)_

## `mux commands`

list all the commands

```
USAGE
  $ mux commands

OPTIONS
  -h, --help              show CLI help
  -j, --json              display unfiltered api data in json format
  -x, --extended          show extra columns
  --columns=columns       only show provided columns (comma-separated)
  --csv                   output is csv format [alias: --output=csv]
  --filter=filter         filter property by partial string matching, ex: name=foo
  --hidden                show hidden commands
  --no-header             hide table header from output
  --no-truncate           do not truncate output to fit screen
  --output=csv|json|yaml  output in a more machine friendly format
  --sort=sort             property to sort by (prepend '-' for descending)
```

_See code: [@oclif/plugin-commands](https://github.com/oclif/plugin-commands/blob/v1.3.0/src/commands/commands.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.0/src/commands/help.ts)_

## `mux init [ENVFILE]`

set up a user-level config

```
USAGE
  $ mux init [ENVFILE]

ARGUMENTS
  ENVFILE  path to a Mux access token .env file
```

_See code: [src/commands/init.ts](https://github.com/muxinc/cli/blob/master/src/commands/init.ts)_

## `mux live:complete STREAMNAME`

Signal to Mux that a live stream has concluded and should be closed.

```
USAGE
  $ mux live:complete STREAMNAME

ARGUMENTS
  STREAMNAME  the name (coupled with --reference-type) to look up in Mux to yield this livestream

OPTIONS
  -d, --disableAfterCompletion  If set, disables the stream upon completion.
  -t, --streamId=stream-id      [default: stream-id] the type of the provided reference name
```

_See code: [src/commands/live/complete.ts](https://github.com/muxinc/cli/blob/master/src/commands/live/complete.ts)_

## `mux live:disable STREAMNAME`

Disables a live stream and prevents encoders from streaming to it.

```
USAGE
  $ mux live:disable STREAMNAME

ARGUMENTS
  STREAMNAME  the name (coupled with --reference-type) to look up in Mux to yield this livestream

OPTIONS
  -t, --streamId=stream-id  [default: stream-id] the type of the provided reference name
```

_See code: [src/commands/live/disable.ts](https://github.com/muxinc/cli/blob/master/src/commands/live/disable.ts)_

## `mux live:enable STREAMNAME`

Enables a live stream, allowing encoders to streaming to it.

```
USAGE
  $ mux live:enable STREAMNAME

ARGUMENTS
  STREAMNAME  the name (coupled with --reference-type) to look up in Mux to yield this livestream

OPTIONS
  -t, --streamId=stream-id  [default: stream-id] the type of the provided reference name
```

_See code: [src/commands/live/enable.ts](https://github.com/muxinc/cli/blob/master/src/commands/live/enable.ts)_

## `mux sign PLAYBACK-ID`

Creates a new signed URL token for a playback ID

```
USAGE
  $ mux sign PLAYBACK-ID

ARGUMENTS
  PLAYBACK-ID  Playback ID to create a signed URL token for.

OPTIONS
  -e, --expiresIn=expiresIn       [default: 7d] How long the signature is valid for. If no unit is specified,
                                  milliseconds is assumed.

  -t, --type=video|thumbnail|gif  [default: video] What type of token this signature is for.
```

_See code: [src/commands/sign.ts](https://github.com/muxinc/cli/blob/master/src/commands/sign.ts)_

## `mux update [CHANNEL]`

update the mux CLI

```
USAGE
  $ mux update [CHANNEL]
```

_See code: [@oclif/plugin-update](https://github.com/oclif/plugin-update/blob/v1.3.10/src/commands/update.ts)_
<!-- commandsstop -->
