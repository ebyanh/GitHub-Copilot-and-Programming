# muse.

A visual discovery and social inspiration website for finding, saving, and sharing ideas.

## Run locally

Install the Python dependency and start the Flask server:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
MUSE_EMAIL_MODE=console MUSE_PORT=5050 python app.py
```

Then open `http://127.0.0.1:5050`. In local console email mode, verification links are shown in the server output and on the sign-up screen instead of being emailed. This mode is restricted to local requests and is for development only. The Flask backend serves the site, idea feed, accounts, and media uploads. Uploaded media, account details, and saved ideas are stored in `uploads/` and `muse.db`. Images and fonts load from Unsplash and Google Fonts.

## Explore

- Search ideas by title, creator, category, media type, or tags.
- Filter the feed by category and image, GIF, or video.
- Create an account with an email address and password, verify your address, and access your saved ideas across sign-ins. Browse as a guest if you prefer.
- Guests keep saved ideas in their browser; signed-in members sync them to their account.
- Open an idea to see its details, preview videos, send it with your device's share sheet, or copy a direct link.
- Add images and videos from your device with **Create**.

## Publish on Render

The included `render.yaml` configures a Render web service and a persistent disk for the SQLite database and uploaded media. To publish:

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, connect the repository, and apply the `render.yaml` configuration.
3. Wait for the first deploy to finish. Render will provide a public HTTPS URL; idea share links use that URL automatically.
4. Configure an SMTP provider in the service's environment settings (`MUSE_SMTP_HOST`, `MUSE_SMTP_PORT`, `MUSE_SMTP_USERNAME`, `MUSE_SMTP_PASSWORD`, and `MUSE_SMTP_FROM`) so signup verification emails can be sent. Set `MUSE_PUBLIC_URL` to your public site URL if your provider or proxy requires an explicit verification-link origin.

The Blueprint uses a paid Render web service and a 1 GB persistent disk. It generates a session secret and prompts for SMTP credentials when creating the service. Review [Render's pricing](https://render.com/pricing) before applying it. You can connect a custom domain later in the Render dashboard.

Email verification links expire after 24 hours. Without SMTP settings, account signup and verification email delivery are unavailable. This is an early prototype; saved ideas are private to each account, while uploaded ideas appear in the shared public feed.