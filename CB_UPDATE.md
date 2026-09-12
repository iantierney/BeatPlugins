# Migration Investigation: CB_OLD to Revision-Based Checkboxes (CB_UPDATE)

- [ ] @ian. <span style="color:red;">  This documents hierarcy is likely incorrect, as it was missappeneded. Get a quick understanding of each section and see if one section should be a child of another. Particularly sections on how you store in revisions, I think the section on using the revsion generations should be folded into this. </span>

This document outlines the design and implementation strategy for migrating the Keywords plugin checkbox state from the legacy **CB_OLD** (`dismissedEntries`) system to the new **Revisions-Based** checkbox system.

---

## 1. Reading the Legacy State
To determine if a migration is required, the updated plugin must check for the presence of the legacy checkbox setting during startup initialization:

```javascript
const oldDismissedArray = Beat.getDocumentSetting("dismissedEntries");
if (oldDismissedArray && oldDismissedArray.length > 0) {
    const legacyDismissed = new Set(oldDismissedArray);
    migrateLegacyState(legacyDismissed);
}
```

---
## 2. Resolving Legacy Keys to Screenplay Text Ranges
Because `CB_OLD` stored keys based on normalized content (e.g., `note:fix_character_dialogue`) rather than absolute locations, the migration routine must map these keys back to active text ranges in the current screenplay.

### Step-by-Step Resolution:
1. Retrieve the list of lines from the active screenplay:
   ```javascript
   const lines = Beat.lines();
   ```
2. Scan the lines to extract inline notes, synopses, and markers, generating legacy-style keys for each element:
   ```javascript
   function getLegacyKey(entry) {
       return `${entry.type}:${normalize(entry.content)}`;
   }
   ```
3. If an entry's generated key is found in the `legacyDismissed` set, record its absolute character range:
   * **Start Position**: `entry.absPos`
   * **Length**: `entry.content.length` (or `entry.matchLen`)

---

## 3. Applying Settings via the Revisions System
Once the character ranges of all legacy-checked items are resolved, they can be registered as visual revisions.

### Writing to the Revisions System:
1. Retrieve the existing document `Revision` object using raw settings:
   ```javascript
   let rawRevision = Beat.getRawDocumentSetting("Revision") || {};
   if (!rawRevision.Addition) {
       rawRevision.Addition = [];
   }
   ```
2. For each resolved legacy range `[startPos, length]`:
   * Determine the target color generation index (e.g., `0` for Blue, or a specific generation color reserved for completed checklist items).
   * Check for duplicates, then append the range to the raw additions list:
     ```javascript
     rawRevision.Addition.push([startPos, length, colorGenerationIndex]);
     ```
3. Persist the updated revisions back to the Fountain file structure:
   ```javascript
   Beat.setRawDocumentSetting("Revision", rawRevision);
   ```
4. Optionally, trigger visual refresh in the editor immediately:
   ```javascript
   Beat.textBackgroundHighlight(colorHex, startPos, length);
   ```

---

## 4. Safe Deletion of Legacy Checkbox State
To clean up after a successful migration, we must delete the legacy `dismissedEntries` data. 

> [!IMPORTANT]
> **Data Integrity Warning**: The old Keywords plugin stored several other critical configurations that must **not** be deleted, including `favoriteTags` (custom user keywords) and interface preferences (`activeTab`, filter toggles like `showSynopsis`).

### Targeted Deletion Logic:
To safely remove only the legacy checkbox state while preserving all other user preferences, perform a targeted set to `null` or `undefined` on the specific key:

```javascript
// Safely delete ONLY the legacy checkbox state
Beat.setDocumentSetting("dismissedEntries", null);

// Log migration success for debugging
Beat.log("[KW Migration] Legacy checkbox state successfully migrated to Revisions and deleted.");
```

This ensures that the shared `.fountain` JSON block is kept clean of deprecated properties, without affecting any other settings saved by the Keywords plugin or other tools.

“4. Storage of Revisions (Focus Area 2)”
*AddedUpdated “4. Storage of Revisions (Focus Area 2)”
Added analysis of the two storage approaches and their implications for the new CB_UPDATE system, plus a new subsection “6. CB_UPDATE Adaptation Considerations (Focus Area 3)”.

You can view the full updated file here:


Ians Beat Revisions Summary.md

Key points added

Findings about the two storage approaches

Within‑the‑Fountain File: JSON block embedded in the .fountain file → portable, works on macOS & iOS.
Version‑Control (Git) Storage: External .git folder → rich Git features, macOS‑only.
Implications for CB_UPDATE

Introduce an abstract storage interface with two concrete implementations (Fountain‑file & Git).
Persist checkbox state only on explicit save/commit actions, not on every toggle.
Provide migration logic for users who switch storage modes after using CB_UPDATE.
Detect active mode via Beats settings; fall back to Fountain method on iOS.
Encapsulate storage to keep core checkbox logic unchanged and future‑proof.
Summary: The two approaches differ mainly in where revision data lives. CB_UPDATE can abstract over this, handling persistence at save time and supporting migration when the underlying Beats storage setting changes.

Let me know if you need any further edits, code implementations, or clarification on how to integrate these considerations into the CB_UPDATE plugin.

---

## TL;DR  SUMMARY OF IMPLICATIONS OF USING GENERATION INDEXING FOR CB_UPDATE

**`CB_UPDATE` **must** store the generation index when persisting the “Keywords” checkbox data inside Beat’s revision system, because the index is what ties that data to Beat’s eight‑generation workflow.  


---

## 1. Why the generation index is required  

| Reason | Effect for the Keywords checkbox data |
|--------|----------------------------------------|
| **Version‑aware snapshots** | Each colour generation (1 → 8) gets its own copy of the checkbox map, so the exact state can be restored when a writer switches back to an earlier generation. |
| **Migration between storage back‑ends** | A clean `generation → checkbox‑state` mapping lets the update translate the data either to the Fountain‑file JSON block or to a Git commit when the user flips Beat’s revision‑storage setting. |
| **Undo/Redo alignment** | Beat’s *Convert* / *Downgrade* actions automatically apply to the stored checkbox data when a generation is changed, keeping UI and state in sync. |
| **Portable, self‑contained script** | Embedding the generation block inside the `.fountain` file carries the checkbox data wherever the script is shared. |
| **Cross‑platform fallback** | On iOS (where Git‑based storage is unavailable) the generation‑aware JSON block is the only viable option, guaranteeing consistent behaviour. |

> **Bottom line:** without the generation index the checkbox state would be detached from Beat’s core revision lifecycle, breaking migration, undo/redo and portable sharing.

---

## 2. Behavioural implications (when the generation index is stored)

1. **Checkbox toggling**  
   * In‑memory changes stay unstaged until the user **commcommits the current generation** (or explicitly runs a “save” action).  
   * On **Commit Revisions** the update writes the JSON block for that generation (or creates a Git commit, depending on storage mode).

2. **Editor display**  
   * Check‑boxes are colour‑coded to match the active generation, just like text additions.  
   * Switching generations loads the corresponding checkbox map, so the UI always reflects the historic state.  
   * *Clear* (toggle visibility) hides the boxes but leaves the underlying data; *Remove* (delete a generation) purges its checkbox data.

3. **Interaction with Beat’s “Clear” vs “Remove”**  
   * **Clear** – only hides the check‑boxes; the generation‑indexed data stays intact.  
   * **Remove** – deletes the generation block **and** its checkbox map, preventing orphaned state.

---

## 3. Storage options (both must include the generation index)

### 3.1 Fountain‑file JSON block (default, cross‑platform)

```json
{
  "CB_UPDATE": {
    "generation": 3,
    "checkboxes": {
      "beatId1": true,
      "beatId2": false,
      …
    },
    "notes": {
      "beatId1": "Important hook here",
      …
    }
  }
}
```

* The block resides at the **end of the `.fountain` file** inside a Boneyard comment (`/* … */`) so ordinary Fountain parsers ignore it.  
* Each generation gets its own top‑level object (`generation: 1 … 8`).  
* Because the data lives **with the script**, sharing the file automatically carries the checkbox state.

### 3.2 Git‑based storage (macOS‑only)

* On **Commit Revisions**, the update writes a dedicated JSON file (e.g. `.cb_update_state.json`) and **commcommits** it alongside the script.  
* The commit message contains the generation number (`CB_UPDATE gen‑4`).  
* When the repository is checked out at a past commit, the matching checkbox map is read from that commit, restoring the exact generation state.

#### Migration flow
1. Detect the active Beat storage mode (Fountain‑file vs Git).  
2. Read the current generation block.  
3. Write the data to the opposite storage format (JSON block ↔ Git commit).  
4. Optionally delete the original block to avoid duplication.  

The reverse migration follows the same steps in opposite order.

---

## 4. Notes handling (still tied to generations)

* **Per‑generation notes** – stored alongside the checkbox map inside the same generation object, guaranteeing they travel with the exact revision.  
* **Global notes** – kept in a separate top‑level `globalNotes` field that is *not* tied to any generation; they appear regardless of the active generation.  
* UI: when a generation is active, only its notes are shown; a “global notes” pane can be toggled on/off.

---

## 5. Edge‑case handling (kept unchanged)

| Edge case | Recommended handling |
|-----------|----------------------|
| **Mixed‑mode (Fountain + Git)** – both storage options enabled. | Detect the active mode via Beat’s settings and write **only** to that mode. Optionally expose a “sync both” command that writes to both and keeps them identical. |
| **Cross‑platform (iOS vs macOS)** – Git unavailable on iOS. | Force Fountain‑file mode on iOS, regardless of UI toggle. |
| **Generation overflow (exceed 8 generations)** | Treat the 9th generation as a new cycle: either truncate older generations after user confirmation or force a “Commit Revisions” that rolls the JSON block into a new file/Git commit and resets the counter. |
| **Concurrent edits (multiple users)** | Rely on Beat’s underlying version‑control conflict resolution. Provide a merge helper that union‑combines true values and merges notes with conflict markers. |

---

## 6. Summary checklist for the **Keywords plugin fork update (`CB_UPDATE`)**

- **[ ]** Store checkbox state **with the generation index** (mandatory).  
- **[ ]** Serialize the data either in the Fountain‑file JSON block **or** as a Git‑commcommitted JSON file, according to the active Beat storage mode.  
- **[ ]** Abstract persistence behind `saveCheckboxState()` / `loadCheckboxState()` so the rest of the Keywords code stays storage‑agnostic.  
- **[ ]** Tie UI rendering to the active generation so check‑boxes and notes appear/disappear together with Beat’s colour‑generation workflow.  
- **[ ]** Implement migration logic that can read one format and write the other, with automatic fallback to Fountain‑file on iOS.  
- **[ ]** Preserve all notes (per‑generation and global) alongside the checkbox map.  

Following this design guarantees that the Keywords plugin fork’s checkbox data behaves exactly like Beat’s own revision system—portable, version‑controlled, and fully integrated with the eight‑generation lifecycle.