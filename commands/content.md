# /content — Content Pipeline Manager

View and manage the content pipeline.

## Steps

1. Read content/_pipeline.md
2. Display current pipeline status:
   - Ideas backlog: [count] ideas
   - In Progress: [count] pieces
   - Published: [count] pieces
   - List each with title and format
3. Ask: "What do you want to do?"
   - **"Capture a new idea"** — Ask for title, format, audience, source material. Create new file in content/ideas/ using templates/content-idea.md. Add row to Ideas table in _pipeline.md.
   - **"Develop an idea"** — Show Ideas list, let the user pick one. Move to In Progress table. Create draft file in content/drafts/. Load relevant source material from wiki/, memory/, raw/. Start the content creation workflow from skills/content-creation.md.
   - **"Check on a draft"** — Show In Progress list, let the user pick one. Read the draft file. Offer to continue working on it.
   - **"Publish something"** — Hand off to /publish command.
   - **"Just browsing"** — Done.
4. After any action, make sure content/_pipeline.md is updated
