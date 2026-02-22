# Security Notes

- Code executes inside Docker with limits on memory, CPU, and timeout.
- Containers are destroyed after run completion.
- Do not expose bridge server beyond localhost without authentication.
- Keep Docker Desktop and Node.js versions patched.
