# Security

## Supported version

The latest tagged release is supported.

## Reporting

Please report security-sensitive findings privately to the repository owner rather than opening a public issue with exploit details.

## Application boundary

EQLWiki - Eye of Zomm is designed to read ordinary EverQuest text logs and user-selected local map/archive files. It must not hook the game process, inspect process memory, inject code, modify game files, or automate gameplay input.

The desktop HTTP service binds only to `127.0.0.1`. Remote wiki knowledge is delivered as a static, SHA-256-verified gzip data pack; live app use does not poll MediaWiki APIs.
