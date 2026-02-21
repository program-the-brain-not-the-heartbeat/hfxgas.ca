# Run Your Own Instance

A plain-English guide to deploying your own Buckit instance.

No coding experience required beyond following these steps.

## What You Need

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A free [GitHub account](https://github.com/join)
- About 20 minutes

## Step 1: Fork the Repository

1. Go to [github.com/program-the-brain-not-the-heartbeat/buckit](https://github.com/program-the-brain-not-the-heartbeat/buckit)
2. Click the **Fork** button in the top right
3. Click **Create fork** — this copies the project to your own GitHub account

## Step 2: Get a Cloudflare API Token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Click **Continue to summary** → **Create Token**
5. Copy the token — you'll need it in Step 3

## Step 3: Find Your Cloudflare Account ID

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Your Account ID is shown in the right sidebar (or in the URL)
3. Copy it

## Step 4: Add Secrets to GitHub

1. Go to your forked repo on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:
   - Name: `CLOUDFLARE_API_TOKEN`, Value: the token from Step 2
   - Name: `CLOUDFLARE_ACCOUNT_ID`, Value: the account ID from Step 3

## Step 5: Configure the Worker

1. In your forked repo, open `wrangler.toml`
2. Change the `name` field if you want a different Worker name
3. Leave everything else as-is

## Step 6: Deploy

1. Push any small change to your repo (or edit `wrangler.toml` and save)
2. GitHub Actions will automatically deploy your Worker
3. Find your Worker URL in the **Actions** tab output — it looks like `https://buckit.your-account.workers.dev`

## Step 7: Create Required Cloudflare Resources (One Time)

You need to create the KV namespace and R2 bucket that the Worker uses.

The easiest way: install Node.js and run:

```sh
npm install -g wrangler
wrangler login
wrangler kv namespace create PREDICTIONS
wrangler r2 bucket create buckit-images
wrangler secret put WEBHOOK_SECRET
```

When creating the KV namespace, copy the namespace ID and update `wrangler.toml`. Then push again to redeploy.

## Step 8: (Optional) Custom Domain

1. Register a domain at [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — enable WHOIS privacy
2. In Cloudflare dashboard: Workers & Pages → your worker → Settings → Custom Domains
3. Add your domain

## How It Works After Setup

Every Thursday, your Worker will automatically:
1. Check r/halifax for /u/buckit's gas price post
2. Parse the prediction
3. Generate an AI image
4. Update your website

You don't need to do anything. It runs itself.

## Customizing

To monitor a different subreddit or user, edit these lines in `wrangler.toml`:

```toml
[vars]
REDDIT_AUTHOR = "buckit"      # Change this to any Reddit username
REDDIT_SUBREDDIT = "halifax"  # Change this to any subreddit
```

Then push to redeploy.
