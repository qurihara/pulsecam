# Publishing PulseCam to GitHub + GitHub Pages

The project is complete and a local git repo with an initial commit is already prepared. The repository could not be created automatically (no GitHub credentials in this environment), so the administrator should run the steps below.

Recommended repository name: **`pulsecam`** (clear, short, available-sounding; matches the library name `PulseCam`). Alternatives considered: `webcam-heart-rate`, `rppg-js`, `pulse-lens`.

## 1. Create the repo and push

Using the GitHub CLI:

```bash
cd pulsecam
gh repo create pulsecam --public --source=. --remote=origin --push
```

Or manually: create an empty `pulsecam` repo on github.com, then:

```bash
cd pulsecam
git remote add origin https://github.com/USERNAME/pulsecam.git
git branch -M main
git push -u origin main
```

## 2. Enable GitHub Pages

Repository → **Settings → Pages** → Source: **Deploy from a branch** → Branch: **`main`** / folder **`/ (root)`** → Save.

The demo (`index.html`) loads `src/pulsecam.js` with a relative path, so it works from the repo root with no build step. The live demo will be at:

```
https://USERNAME.github.io/pulsecam/
```

> Note: webcam access (`getUserMedia`) requires HTTPS. GitHub Pages serves over HTTPS, so the camera works there. Locally, use `http://localhost` (also treated as a secure context) — e.g. `python3 -m http.server`.

## 3. After publishing

Replace `USERNAME` in `README.md` and `package.json` with the actual GitHub account.
