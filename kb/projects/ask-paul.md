---
title: Ask Paul
name: Ask Paul
status: In progress
summary: An AI agent that answers questions about Paul's work, citing a source for every claim.
stack: TypeScript, Preact, Hono, Anthropic and OpenAI APIs
live: https://askpaul.paulobike.com
liveLabel: Try it live
code: Private repository
---
# Ask Paul

## Overview
- An AI agent that answers recruiters' questions about Paul's work, citing a source for every claim.
- It ships as an embeddable widget on his portfolio and as a standalone site that explains how it works.

## How it works
- Streams answers with visible tool steps, numbered citations and a sources pane.
- Builds tailored one-page résumés from a pasted job description, using only lines from the knowledge base.
- Runs on a provider-agnostic agent loop with Anthropic and OpenAI adapters, so the model is a configuration setting.
- Automated evaluations check citation accuracy and refusals before any model or prompt change ships.

## Stack
- TypeScript, Preact web component, Hono, Zod, Vitest.
