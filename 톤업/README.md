<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/801eadcd-b9db-4382-a938-1a21d7b9dea9

## Run Locally

**Prerequisites:**  Node.js (for local dev) or Docker (for containerized deploy)

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill required variables (GEMINI_API_KEY and VITE_FIREBASE_*)
3. Run the app (development):
   `npm run dev`

## Deploy to Google Cloud Run (CI)

This repository includes a GitHub Actions workflow that builds a container image and deploys it to Cloud Run.

Required repository secrets (configure in Settings > Secrets):
- `GCP_SA_KEY` — JSON service account key (the full JSON contents)
- `GCP_PROJECT` — GCP project id (lowercase)
- `CLOUD_RUN_SERVICE` — Cloud Run service name (e.g. toneup)
- `CLOUD_RUN_REGION` — region (e.g. asia-northeast3)

To deploy:
1. Ensure the service account has permissions: roles/run.admin, roles/storage.admin, roles/iam.serviceAccountUser
2. Push a commit to `main` or this feature branch — the workflow `cloud-run.yml` will build, push the image to GCR and deploy to Cloud Run.

Notes:
- Do not commit secret keys. Use the repository secrets UI or your CI provider's secret store.
- The Dockerfile performs a multi-stage build (frontend build + server bundle).



**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
