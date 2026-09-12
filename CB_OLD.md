# CB_OLD: Keywords Plugin Checkbox State System

This document explains the **CB_OLD** system used by the Main Keywords plugin to retrieve, represent, and store the state of checked (dismissed) checklist items associated with Fountain notes, synopses, and markers.

---

### 1. State Retrieval (Loading)
Upon launching the Keywords plugin, the checkbox states are retrieved from the active screenplay document settings using Beat's document setting API:

```javascript
let savedDismissed = Beat.getDocumentSetting("dismissedEntries") || [];
```

* **Storage Location**: `Beat.getDocumentSetting` stores the data directly inside the active `.fountain` file as part of the custom JSON metadata block appended at the end of the file.
* **Format**: The retrieved data is returned as a serialized array of unique string keys.

---

### 2. In-Memory Representation
To facilitate efficient lookup, adding, and removing of checked items, the plugin converts the array of strings into a native JavaScript `Set` at runtime:

```javascript
let dismissedEntries = new Set(savedDismissed);
```

#### Entry Key Structure
Every checklist item (notes, synopses, markers, and notepad items) is assigned a unique identifying string key constructed from its type and normalized content:

| Entry Type | Key Structure | Example Key |
| :--- | :--- | :--- |
| **General Notes** | `note:${normalize(content)}` | `note:fix_character_dialogue` |
| **Marker Notes** | `marker:${normalize(content)}` | `marker:re_write_action` |
| **Synopsis Lines** | `synopsis:${normalize(content)}` | `synopsis:intro_to_protagonist` |
| **Notepad Entries** | `notepad:${blockIndex}` | `notepad:2` |
| **Dynamic Fallback** | `entry.type:${entry.lineIndex ?? entry.absPos}` | `note:4512` |

*Note: The `normalize(text)` function sanitizes the content (typically trimming whitespace and lowercasing) to ensure that slight textual formatting changes don't break the association.*

#### Visual Representation in UI
When rendering the plugin interface:
* The system checks if `dismissedEntries.has(entryKey)` is true.
* If **true**, the HTML checkbox is rendered with the `checked` attribute, and the label text is styled with a strikethrough and reduced opacity:
  ```css
  text-decoration: line-through;
  opacity: 0.5;
  ```
* If the user has disabled the "Show completed" filter (`showCompleted = false`), completed/checked entries are completely hidden from the panel list.

---

### 3. State Storage (Saving)
When a user clicks a checkbox in the HTML view, it triggers a JavaScript callback to the plugin context:

```javascript
Beat.custom.toggleDismissed(entryKey)
```

The plugin updates both the in-memory state and the serialized document storage in a single transaction:

```javascript
toggleDismissed(key) {
  if (dismissedEntries.has(key)) {
    dismissedEntries.delete(key);
  } else {
    dismissedEntries.add(key);
  }
  
  // Persist the updated set back to the Fountain file metadata block
  Beat.setDocumentSetting("dismissedEntries", Array.from(dismissedEntries));
}
```

* **Persisted Format**: The `Set` is converted back into an array using `Array.from()` and saved.
* **Under the Hood**: Because it uses the safe `Beat.setDocumentSetting` API, Beat automatically handles prefixing the key and serializing it into the custom JSON settings block at the bottom of the `.fountain` file, ensuring compatibility and avoiding conflicts with other plugins.
