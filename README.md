# muse.

A visual discovery and social inspiration website for finding, saving, and sharing ideas.

## Run locally

Install the Python dependency and start the Flask server:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Then open `http://127.0.0.1:5000`. The Flask backend serves the site, idea feed, and media uploads. Uploaded media and its metadata are stored locally in `uploads/` and `muse.db`; saved ideas are stored in the browser's local storage. Images and fonts load from Unsplash and Google Fonts.

## Explore

- Search ideas by title, creator, category, media type, or tags.
- Filter the feed by category and image, GIF, or video.
- Save ideas to your browser and revisit them from **Saved ideas**.
- Open an idea to see its details, preview videos, send it with your device's share sheet, or copy a direct link.
- Add images and videos from your device with **Create**.

## Publish on Render

The included `render.yaml` configures a Render web service and a persistent disk for the SQLite database and uploaded media. To publish:

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, connect the repository, and apply the `render.yaml` configuration.
3. Wait for the first deploy to finish. Render will provide a public HTTPS URL; idea share links use that URL automatically.

The Blueprint uses a paid Render web service and a 1 GB persistent disk. Review [Render's pricing](https://render.com/pricing) before applying it. You can connect a custom domain later in the Render dashboard.

This is an early prototype, not a full multi-user social network: it has no accounts, and saved ideas are private to each browser. Uploaded ideas are shared through the public feed.