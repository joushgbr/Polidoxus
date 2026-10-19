# Polidoxus

*Nec festinans nec cessans.*

The Deck: the ship console for ESCAPE VELOCITY. This repo is public and holds only the app.
Your log, Firewall nodes and transmissions live privately in your own Google Sheet ("Polidoxus Log").

## How it fits together

- **The Deck** (this repo, served free by GitHub Pages) runs on the iPad as a home-screen app.
- **The ship's log** is a Google Sheet in your Drive. A small Apps Script (`apps-script/Code.gs`) turns it into the Deck's private save point.
- **The Operator** (Claude) reads the Sheet at debrief and drops `polidoxus-patch-*.json` files into the same Drive folder. The script applies them on the next sync, then renames them `applied-…`.

## One-time setup

### 1. Publish the Deck (GitHub)
1. Create a new **public** repository named `polidoxus`.
2. Upload everything in this folder (keep `apps-script/` too).
3. Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
4. After about a minute the Deck is live at `https://<your-username>.github.io/polidoxus/`.

### 2. Switch on the ship's log (Google)
1. Open the **Polidoxus Log** sheet in the **Polidoxus** folder of your Google Drive.
2. Extensions → **Apps Script**. Delete what's there, paste all of `apps-script/Code.gs`, and save.
3. In the function menu pick **setup** → **Run**. Approve the permissions. Google warns that the app isn't verified, because you wrote it: Advanced → Go to Polidoxus (unsafe) → Allow.
4. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone** → Deploy.
5. Copy the **Web app URL** (it ends in `/exec`).

### 3. Install on the iPad
1. Open `https://<your-username>.github.io/polidoxus/` in **Safari**.
2. Share → **Add to Home Screen** → Add.
3. Open **Polidoxus** from the Home Screen. On "Link the ship", paste the Web app URL and tap **Link**.

## Updating
- **The Deck:** replace `index.html` in this repo. The iPad picks it up on its next launch.
- **The Apps Script:** after editing `Code.gs`, use Deploy → Manage deployments → edit → Version: **New version**. The URL stays the same.

## Privacy
Anyone with the Web app URL can read and write the log, so treat it like a password. Don't post it anywhere or commit it to this repo.
