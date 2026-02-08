# Podcast Generator Service

FastAPI service that generates Daily Gist podcast episodes from newsletter text.

## Environment Variables

| Variable | Description |
|---|---|
| `GENERATOR_API_KEY` | Bearer token for authenticating requests from the Next.js app |
| `GEMINI_API_KEY` | Google Gemini API key (for TTS) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for transcript generation via Podcastfy) |

## Railway Deployment

1. Connect repo in Railway, set **Root Directory** to `services/podcast-generator`
2. Railway will auto-detect the Dockerfile
3. Set the three environment variables above
4. **Important:** Set request timeout to **900 seconds** in Settings > Networking

## Local Development

```bash
cd services/podcast-generator
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export GENERATOR_API_KEY=test-key
export GEMINI_API_KEY=...
export ANTHROPIC_API_KEY=...

uvicorn main:app --reload --port 8000
```

## API

### `GET /health`

Returns `{"status": "ok"}`.

### `POST /generate`

**Headers:** `Authorization: Bearer <GENERATOR_API_KEY>`

**Body:**
```json
{
  "user_id": "...",
  "newsletter_text": "--- Newsletter: ... ---\n..."
}
```

**Response:**
```json
{
  "audio_base64": "<base64-encoded MP3>",
  "transcript": "<Person1>...</Person1>\n<Person2>...</Person2>..."
}
```

## Docker

```bash
docker build -t podcast-gen services/podcast-generator/
docker run -p 8000:8000 \
  -e GENERATOR_API_KEY=test-key \
  -e GEMINI_API_KEY=... \
  -e ANTHROPIC_API_KEY=... \
  podcast-gen
```
