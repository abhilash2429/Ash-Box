# Troubleshooting

## Runtime unavailable

- Ensure Docker Desktop is running.
- Start bridge with `npm run bridge`.

## Base image missing

- Build image with `npm run build-image`.

## Extension not connecting

- Verify extension host permission to `http://127.0.0.1:3876/*`.
- Confirm bridge is listening on port `3876`.
