# Release Report

- Generated At: 2026-04-28T05:33:18.878622Z
- Stats Window: 24h
- Session Scope: b9fe1f6b-1bcc-48f8-ac3c-e570b1e64e00

## Readiness

- Ready: true

| Check | OK | Detail |
| --- | :---: | --- |
| database | true | ok |
| redis | true | ok |
| model | true | OpenAI-compatible endpoint reachable |

## Models

- Default Provider: OPENAI
- Default Model: qwen/qwen3.5-9b

| Provider | Model | Default |
| --- | --- | :---: |
| OPENAI | qwen/qwen3.5-9b | true |
| OPENAI | qwen3-embedding-8b-dwq | false |
| OPENAI | qwen/qwen3.6-35b-a3b | false |
| OPENAI | text-embedding-nomic-embed-text-v1.5 | false |

## Tool Stats

- Total Runs: 1
- Success Rate: 100.0%
- Avg/P95 (ms): 142 / 142

### Duration Buckets

| Bucket | Count |
| --- | ---: |
| <=500ms | 1 |
| 500ms-1s | 0 |
| 1s-3s | 0 |
| >3s | 0 |

### Top Tools

| Tool | Runs | Success Rate | Avg Ms | P95 Ms |
| --- | ---: | ---: | ---: | ---: |
| searchCode | 1 | 100.0% | 142 | 142 |
