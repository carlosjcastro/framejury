# Contributing to Framejury

Thank you for taking the time to look at Framejury, and for considering a contribution, whether it is a bug report, an idea or a pull request. This guide explains how the project is organized and what is expected from a change, so that your work can be reviewed quickly.

## Before you start

If you found a bug or have an idea, please open an issue first and describe what you saw or what you would like to happen, because a short conversation often saves time on both sides. For bugs, it helps to include your operating system, your Python and Node versions, the model you used and the exact message shown by the interface. Please never attach photos that belong to other people, since a generated test image or a description is enough to explain almost any problem.

Security problems are the exception and should not go in a public issue, so please follow the instructions in `SECURITY.md` instead.

## Setting up

The README explains how to install the engine and the interface, and the same steps apply to development. In short, you need Python 3.10 or newer, Node.js 20.9 or newer and Ollama with the model `gemma4:e4b-it-qat`, although the tests do not need the model because they use a simulated Ollama connection.

## Checking your work

Before opening a pull request, please run the tests of the engine from the backend folder and the checks of the interface from the frontend folder.

```bash
cd backend
python -m pytest

cd ../frontend
npm run lint
npx tsc --noEmit
```

A change that adds or modifies behavior should come with a test, and a change to the interface should be tried in the browser, including the unhappy paths such as Ollama being off, the model not being downloaded and a folder without photos.

## Principles of the project

Some ideas guide every decision in Framejury, and a contribution fits best when it respects them.

Photos must never leave the computer, so a change that sends images, thumbnails or file names to an outside service will not be accepted. The language model only reports observations and plain rules make the decision, so new criteria should be added as readable rules in `decision.py` and not as hidden behavior inside a prompt. Every decision needs a reason that a person can read and verify, and a close call should be marked for review instead of being decided silently. Finally, the original photos are read only, which means that exports must write copies or new companion files and must never overwrite what already exists.

## Style of the code

Please keep the code small, readable and consistent with the surrounding files, prefer clear names over comments, and avoid adding a dependency when a few lines of code can do the same job. Python code follows the existing structure of the `framejury` package, and the interface uses TypeScript, React and Tailwind CSS in the same way as the current components.

## Commits and pull requests

Commit messages follow the Conventional Commits format without a scope, written in English, with a short summary in the imperative and an optional body that explains why the change was made.

```text
feat: add a dry run preview before exporting
fix: keep the review label after a rerun
docs: explain how to change the grouping time
```

A pull request should describe what changed and why, mention the issue it relates to and stay focused on one topic, because small changes are much easier to review than large ones. Be aware that the project was created for the DEV Hacktoberfest Open Source AI Challenge, so changes made after the end of the entry period are noted in the README.

## Conduct

Please be kind and patient with everyone who takes part, assume good intentions and keep the discussion centered on the work, since a friendly space is what makes a small project worth contributing to.
