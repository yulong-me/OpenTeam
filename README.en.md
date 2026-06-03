# OpenTeam

<p align="center">
  <img src="assets/openteam-icon-tile-light.svg" alt="OpenTeam logo" width="112">
</p>

<p align="center">
  <a href="README.md">中文</a> | English
</p>

> A local-first, free, open-source, self-evolving AI work team.

OpenTeam is not another chatbot, and it is not just a group chat of agents. It organizes different models, roles, and agent capabilities into an AI work team that can challenge, review, verify, and deliver real project work together.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-20.19%2B%20%7C%2022.12%2B--25.x-green)
![pnpm](https://img.shields.io/badge/pnpm-10.x-orange)

https://github.com/user-attachments/assets/930440d8-4971-4e92-8d35-a903b6d729b3

## Why OpenTeam?

AI agents are moving from single bots to AI teams. But many "teams" are still just multiple roles taking turns in a chat.

OpenTeam focuses on a version that is useful for real project work:

- **Local-first**: project files, context, and team memory stay on your machine first
- **Free and open-source**: MIT License, no seat pricing, no platform lock-in
- **Multi-model collaboration**: different agents can use different providers and models
- **Cross-checking**: planning, research, implementation, review, and QA can constrain each other
- **Self-evolving**: preserve project rules, user preferences, workflows, and lessons learned

## Core Capabilities

- Customize Teams, Agents, Providers, models, and System Prompts
- Let Agents ask, challenge, and supplement each other with `@mention`
- Keep project context around a local Workspace
- Store rooms, messages, Teams, Agents, and Provider configuration in local SQLite
- macOS desktop builds support code signing, notarization, DMG install, and auto-update

## Download

Current desktop support focuses on macOS Apple Silicon:

- [Download the latest OpenTeam macOS DMG](https://github.com/yulong-me/OpenTeam/releases/latest)

The desktop app runs frontend and backend capabilities inside Electron. It does not expose HTTP service ports to end users. User data is stored in the system application data directory, so upgrades do not overwrite SQLite, workspaces, or Provider configuration.

## Configuration

Configure these in Settings:

- **Provider**: CLI path, API Key, Base URL, default model
- **Agent**: role name, Provider, model override, System Prompt, tags
- **Team**: description, workflow prompt, collaboration rules, acceptance criteria

Built-in perspective expert prompts live in [.agents/skills](./.agents/skills).

## Roadmap

- Team Memory: preserve project rules, user preferences, and decisions
- Team Playbooks: reusable workflows for engineering, research, writing, and distribution
- Evidence Trail: link key conclusions to files, commands, sources, and verification results
- Windows desktop: packaging, signing, and auto-update

## License

MIT
