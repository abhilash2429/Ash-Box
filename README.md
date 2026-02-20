# Executor

Ephemeral local code execution tool. Paste code, declare dependencies, run, destroy.

## Supported Languages

| Language   | Dependencies       | Notes                              |
|------------|--------------------|------------------------------------|
| Python     | pip packages       |                                    |
| JavaScript | npm packages       | Node.js 20                         |
| Go         | none (stdlib only) |                                    |
| Ruby       | gems               |                                    |
| Java       | none               | Public class **must** be named `Main` |
| C          | none               | Links `-lm` (math library)         |
| C++        | none               | Links `-lm` (math library)         |

## Prerequisites

- Node.js 18+
- Docker Desktop (running)

## Setup

```bash
# 1. Install Node dependencies
npm install

# 2. Build the base Docker image (run once — takes 3–8 minutes)
node build-image.js

# 3. Start the application
npm start
```

## Usage

1. Select a language tab
2. Paste or write code in the editor
3. For Python, JavaScript, and Ruby: enter package names in the dependency field
4. Click **Run** or press **Ctrl+Enter**
5. Output streams into the console pane
6. Container is automatically destroyed after execution

## Constraints (by design)

- Single file execution per language
- 60-second timeout
- 512 MB memory limit
- 1 CPU core
- No state persists between runs

## Java constraint

Java requires the public class name to match the file name. Executor writes your code to `Main.java`, so your public class must be named `Main`:

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
```

## Troubleshooting

**"Docker not available"** — Start Docker Desktop, wait for initialization, restart Executor.

**"Base image not found"** — Run `node build-image.js` first.

**pip/npm/gem install is slow** — Dependency installation runs fresh each execution. Environment caching is a planned post-MVP optimization.
