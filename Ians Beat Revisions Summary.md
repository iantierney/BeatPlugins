### Beat Revisions System Report (`I_B_REV`)
This report summarizes how the **Beat.app** revision tracking and management system works, detailing its relationship to traditional script revision methods, terminology hazards, markup representation, and file storage.
---
### 1. Relationship to Traditional Systems
* **Hollywood Color-Coded Revision System**: Beat directly adapts the traditional production draft revision system (used to lock pages and track changes across generations).
* **Eight-Generation Cycle**: Beat supports up to **eight revision generations**, using the standard industry colors and margins in this order:
  1. **1st Generation**: Blue (`*` symbol)
  2. **2nd Generation**: Pink (`**` symbol)
  3. **3rd Generation**: Yellow (`+` symbol)
  4. **4th Generation**: Green (`++` symbol)
  5. **5th Generation**: Goldenrod (`@` symbol)
  6. **6th Generation**: Buff (`@@` symbol)
  7. **7th Generation**: Rose/Salmon (`#` symbol)
  8. **8th Generation**: Cherry (`##` symbol)
* **Virtual Adaptation**: Unlike traditional physical revisions which permanently "burn" edits into paper, Beat's implementation is **completely virtual and dynamic** in the editor. Revision tracking can be toggled on/off, and markers can be converted, hidden, or downgraded programmatically.
---
### 2. Terminology: Conflation Hazards
When working with Beat's revisions, you must not conflate the following terms:
* **Commit Revisions vs. Commit**: 
  * **Commit Revisions** (under *Screenplay* menu) finalizes a draft's visual changes by permanently deleting any text "marked for removal" and clearing all visual color highlights/asterisks from the document.
  * **Commit** (under *Screenplay → Version Control* menu) is a Git-style action that saves a permanent, full-state snapshot of the screenplay's history to allow rollback.
* **Remove vs. Clear**:
  * **Remove** actively deletes visual revision markers from a selected range of text (via shortcut `Cmd+Opt+K` or context menu) or strips a specific generation color.
  * **Clear** temporarily toggles off the visual display of revision highlights in the editor or outline view without deleting the revision metadata or the text marked for removal.
* **Convert vs. Downgrade**:
  * **Convert** changes all markers of one generation directly to another (e.g., converting all green 4th-gen markers to blue 1st-gen).
  * **Downgrade** shifts all markers down by exactly one generation in the hierarchy (e.g., 4th-gen green becomes 3rd-gen yellow).
---
### 3. Markup and Representation (Focus Area 1)
* **Additions**:
  * Added text is tracked programmatically using character offsets.
  * Visually, added text is highlighted in the active generation's color in the editor.
* **Deletions / "Marked for Removal"**:
  * Deleted text is **not immediately erased** from the document.
  * Instead, it is treated as **"Marked for Removal"** and renders visually with a **red strikethrough** in the editor and draft PDF exports.
  * Inside the raw Fountain file structure, text marked for removal is enclosed within Fountain's **Boneyard block syntax (`/*` and `*/`)**. This ensures standard screenplay formatters safely ignore it, while Beat keeps it visible and visually styled until a developer/writer commits the revisions.
---
### 4. Storage of Revisions (Focus Area 2)
* **Within the Fountain File (Single-File Portability)**:
  * Beat does **not** use separate sidecar files or database tables to store visual revisions. All document settings, metadata, and revision ranges are stored **directly within the `.fountain` file**.
  * They are appended to the very end of the `.fountain` file as a **JSON metadata block**, typically wrapped inside a Fountain Boneyard comment (`/* ... */`) to keep it human-readable while ensuring non-Beat Fountain applications ignore it.
  * The JSON block uses specific raw document keys to track changes:
    * `"Revision"`: Contains an object with arrays tracking edits (e.g., `"Addition"` maps arrays containing `[startIndex, length, colorGenerationIndex]`).
    * `"Changed Indices"`: Tracks the specific text ranges modified during editing.
* **Version Control Storage (Multi-File History)**:
  * If a writer utilizes the Git-based *Version Control* system, the historical commits, diffs, and snapshots are stored **outside the plain-text file**, managed inside a standard hidden `.git` folder within the local project directory.
---
### 5. Switching and Implementation Status
#### How to Switch Between Systems:
* **To use the "Within the Fountain File" Revisions system (Visual Markers)**:
  * Open the **Quick Settings** panel (accessible on both macOS and iOS) or the **Screenplay** menu and check/toggle **Revision Mode** to on.
  * Any text typed or deleted while this is active will be visually tracked. You can also manually apply/remove revision markers to selected text blocks using the context menu or keyboard shortcuts (`Cmd+K` to mark, `Cmd+Opt+K` to clear).
* **To use the Git-Based Revision system (Version Control History)**:
  * Navigate to **Screenplay → Version Control** from the macOS menu bar. 
  * This launches a separate sidebar interface enabling Git-style "commits" (snapshots) where you can compare diffs (green/red highlights), check changes, and jump back to previous states of your script.
#### Implementation Status:
* **"Within the Fountain File" Revisions System**: **Fully Implemented**. Available on both **macOS and iOS**. All color generations, visual margins, strikethroughs, and formatted PDF exports work seamlessly.
* **Git-Based Revision System (Version Control)**: **Fully Implemented but macOS-only**. Because this feature interacts directly with git repository architecture on disk under the hood, it is restricted to macOS and is **not available on iOS**.
### 6. CB_UPDATE Adaptation Considerations (Focus Area 3)

**Findings about the two storage approaches**
- *Approach 1 – Within‑the‑Fountain File*: Stores revision metadata as a JSON block inside the `.fountain` file itself.  This makes the revision data portable with the script but ties storage to the file’s text format.
- *Approach 2 – Version‑Control (Git) Storage*: Keeps revision history in a hidden `.git` directory separate from the script file.  This leverages Git’s powerful history, branching and collaboration features, but the revision data is not embedded in the script file.

**Implications for the new `CB_UPDATE` system**
- **Abstraction Opportunity**: `CB_UPDATE` can define an abstract storage interface (e.g., `saveCheckboxState(data)`) and provide two concrete implementations – one that writes to the Fountain‑file JSON block and one that commits a change to the Git repo.  This keeps the core checkbox logic agnostic of the underlying storage.
- **When to Adapt**: The adaptation only needs to happen when `CB_UPDATE` persists its checkbox state (e.g., on save or explicit user action).  Runtime checkbox toggles can remain in‑memory, avoiding unnecessary storage writes for each state change.
- **Dual‑implementation Requirement**: If a user switches the Beat revision storage setting after `CB_UPDATE` has been used, the plugin must be able to migrate existing checkbox data between the two formats.  Therefore, `CB_UPDATE` should include a migration routine that reads the current storage format and writes the data using the newly selected format.
- **Potential Edge Cases**:
  - *Mixed‑mode*: Users might have the Fountain‑file storage enabled but also maintain a Git repo.  `CB_UPDATE` should detect the active mode (via Beat’s settings) and only write to the active store.
  - *Cross‑platform*: The Git‑based approach is macOS‑only.  On iOS, `CB_UPDATE` must fall back to the Fountain‑file method regardless of user preference.
- **Minimal Intrusion Strategy**: By encapsulating storage behind a thin adapter, the rest of the `CB_UPDATE` codebase does not need to change when new revision storage strategies are introduced in the future.

**Summary**: The two existing revision storage approaches primarily differ in *where* the data lives (inside the script vs. external Git history).  `CB_UPDATE` can abstract over this distinction, handling persistence only at save time and providing migration logic for users who toggle the underlying Beat storage setting.
