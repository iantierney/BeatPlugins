# Accepting AI‑Generated Changes in Antigravity IDE (macOS)

## Quick reference – how to apply the AI‑generated Markdown

| # | GUI element / technique | How to use it | What you should see when the accept action is available |
|---|--------------------------|----------------|----------------------------------------------------------|
| **1️⃣** | **AI‑suggestion banner** (thin bar just above line 1) | Open the file. If a banner appears it will say something like *“AI‑generated changes – X suggestion(s)”*. Click the **`Apply All`** / **`Accept`** button on the right side. | The banner disappears, the file content updates instantly, and the file tab no longer shows the unsaved‑changes dot. |
| **2️⃣** | **Inline “Accept” buttons** next to each diff hunk (when opened in *Diff* view) | Open the **Changes** panel (⌘ ⇧ C). Find `CB_OLD.md` under *Modified* or *Untracked*. Expand the diff – each changed block shows a small **✓ Accept** button on the left. Click the top‑most button to accept the whole file or accept individual hunks. | The hunk(s) turn green, the diff view collapses, and the file is marked clean (no dot on the tab). |
| **3️⃣** | **Keyboard shortcut “Accept All”** (works when the diff view or banner is focused) | Click inside the editor to give it focus, then press **⌘ Enter**. | Same effect as clicking **Apply All** – all pending AI changes are merged. |
| **4️⃣** | **Copy‑and‑Paste fallback** (works even if no UI element appears) | In the **AI Assistant** sidebar locate the generated text, click the clipboard icon (or select and press ⌘ C). Switch back to `CB_OLD.md`, select all (⌘ A), paste (⌘ V), and save (⌘ S). | The file now contains exactly the AI‑generated Markdown – no UI “accept” button needed. |
| **5️⃣** | **Refresh / Reload editor** (when UI seems stuck) | Right‑click the file tab → **Refresh** (or press ⌘ R). If the banner still does not appear, close the file and reopen it. | The suggestion banner (or diff view) should re‑appear if there are pending AI changes. |
| **6️⃣** | **Toggle the “AI Assistant” pane** | Click the **⚡ AI** button in the top‑right toolbar to show/hide the assistant pane. The banner only appears when the pane is visible. | When the pane is visible, the banner appears; when hidden, it is suppressed. |
| **7️⃣** | **Open the file in “Diff” mode manually** | Right‑click the file tab → **Open in Diff** (or use the command palette ⌘ ⇧ P → “Open Diff”). This forces the editor to render any pending AI changes as a diff with accept buttons. | You’ll see the diff view with accept options even if the banner is missing. |

---

### Should the editor window be showing an accept option?

**Yes.** If Antigravity IDE has a pending AI‑generated edit for a file, it will surface **one** of the UI cues above (banner, inline accept buttons, or the ⌘ Enter shortcut). If none appear, the IDE treats the file as a plain local file with **no pending AI diff**.

---

### Most likely reasons the accept UI is **not** showing

| # | Reason | Why it happens | How to verify / fix |
|---|--------|----------------|----------------------|
| **1️⃣** | **No pending AI edit queued** | The model may have written the file directly (e.g., via `write_to_file`) instead of creating a diff. The file is already “accepted”. | Compare the file content with the AI‑generated text in the chat. If they match, the edit is already applied. |
| **2️⃣** | **AI Assistant pane is hidden** | The suggestion banner only renders when the **AI Assistant** sidebar is visible. | Click the **⚡ AI** button to show the pane; the banner should re‑appear. |
| **3️⃣** | **File opened in plain view instead of diff mode** | Some plugins (e.g., a Markdown preview) replace the normal editor with a read‑only view that hides the diff UI. | Close the file, then reopen it with **Open → Plain Text** (or use the command palette “Open File”). |
| **4️⃣** | **Plugin conflict / custom Markdown renderer** | Community plugins that override the editor UI can hide the suggestion banner. | Temporarily disable such plugins (Preferences → Plugins) and reload the file. |
| **5️⃣** | **Unsaved changes already present** | If the file already has unsaved edits that differ from the AI suggestion, the IDE may suppress the banner to avoid conflict. | Save any manual edits (⌘ S) and reopen the file; the banner should appear if a pending diff exists. |
| **6️⃣** | **Corrupted UI state** (rare) | UI cache can become out‑of‑sync after a crash or space switch. | Restart Antigravity IDE (quit / launch). |
| **7️⃣** | **File excluded from source‑control** | When a file is listed in `.git/info/exclude` and the IDE is set to only show diffs for tracked files, the diff view may be hidden. | Open **Preferences → Source Control** and enable “Show diffs for untracked files”, or temporarily remove the file from the exclude list. |

---

### Quick troubleshooting checklist

1. **Confirm a pending AI edit** – compare the current file content to the AI‑generated text in the chat. If identical, you’re already “accepted”.
2. **Show the AI Assistant pane** – click the ⚡ AI button; the banner should appear.
3. **Check editor mode** – ensure you’re not in a preview‑only mode; use the plain‑text editor.
4. **Disable interfering plugins** – especially any that replace the Markdown view.
5. **Save any local edits** – ⌘ S, then refresh (⌘ R).
6. **Restart the IDE** – if the UI still looks wrong.

If after these steps the accept UI is still absent, you can safely use the **copy‑and‑paste fallback** (Technique 4) to “accept” the changes manually.
