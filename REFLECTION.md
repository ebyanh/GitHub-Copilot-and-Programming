# Muse development reflection

## What did you ask Copilot to help you build? How did you break down the problem?

I started by asking for a Python website that could help people discover ideas visually and save and share images, videos, and GIFs. We broke that broad idea into an existing Muse prototype's main pieces: the visual feed, search and filters, media uploads, saved ideas, and shareable links. Once I asked about publishing it, we handled hosting as a separate step by preparing a Render configuration. I then described the first-visit account experience I wanted, chose verified email-and-password sign-up with guest browsing, and split that into the welcome screen, sign-in/sign-up forms, email verification, account sessions, and account-specific saved ideas. Finally, I reported the JSON error I saw while testing sign-up, and we traced the response and local server setup.

## How did your approach to asking questions change as you worked?

My first request described the product idea broadly. As Muse took shape, I shifted to concrete product decisions and observable problems: how a visitor should sign in, whether browsing should require an account, and the exact error shown during sign-up. I answered a focused choice about verification and guest access, and later asked for the whole project to be pushed together with this reflection. That made it easier to turn the next request into a specific implementation and a testable result.

## What parts of the development process with GitHub Copilot surprised you?

The project already contained a Muse starter, so we were able to extend it instead of beginning with an empty folder. I was also surprised that the sign-up message was not caused by a malformed account response from Muse: the browser was reaching an empty HTTP 403 response on port 5000 from another local service. Moving Muse to port 5050 exposed a second, expected setup issue: local email verification needs an email provider. We added a local-only console verification mode so I could test the full flow without sending real email. Browser checks also caught a case where merely opening a verification link could activate an account; we changed the flow to ask for confirmation first.

## What did you learn about the technology you used that you didn't know before?

I learned that Flask can serve both the website and JSON API endpoints, while SQLite can store users and saved ideas locally. The account flow uses password hashes and expiring, single-use email-verification tokens; signed-in saved ideas live on the server, while guest saves live in the browser. I also learned that deploying a Flask app is not just putting its files online: Render needs a production server, persistent storage for uploads and the database, a secret for sessions, and SMTP settings to send real verification messages.

## What would you do differently if you had to build this again?

I would decide earlier which parts must be real for the first release—especially account sign-in, email delivery, and public hosting—and make a small end-to-end account flow work before layering on more interface features. I would also check the local server port and email configuration at the start, then write repeatable tests for sign-up, verification, sign-in, and user-to-user saved-idea isolation before trying the flow in a browser. That would make configuration problems easier to distinguish from application bugs.
