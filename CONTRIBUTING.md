# Contributing (GitHub Flow)

This repo uses a simple production-first workflow:

- `main` is the production branch
- every change goes through a Pull Request
- merging to `main` triggers the production deploy workflow

## Local dev

Create a feature branch:

```bash
git checkout main
git pull
git checkout -b feature/<short-name>
```

Run checks before pushing:

```bash
go test ./...

npm ci
npm --workspace frontend run lint
npm --workspace frontend run build
```

## Pull Requests

1. Push your branch and open a PR targeting `main`.
2. Wait for CI to pass (tests + lint + build + docker build).
3. Merge using **Squash and merge**.

## Deployment

- Merging to `main` triggers the GitHub Actions deploy workflow.
- The VPS deploy runs [deploy/deploy.sh](deploy/deploy.sh), which pulls `origin/main` and restarts the production compose stack.

### SSH host key pinning (recommended)

The deploy workflow supports pinning the VPS SSH host key via a GitHub Secret called `VPS_SSH_KNOWN_HOSTS`.

Generate it (use the VPS **IP/hostname you SSH into**):

```bash
ssh-keyscan -p 22 -H <VPS_IP_OR_HOSTNAME>
```

Copy the full output line(s) into the `VPS_SSH_KNOWN_HOSTS` GitHub Secret.

## Branch protection (recommended)

In GitHub:

- Settings → Branches → Branch protection rules → add rule for `main`
  - Require a pull request before merging
  - Require status checks to pass before merging (select the `CI` checks)
  - Require conversation resolution before merging
  - Block force pushes
