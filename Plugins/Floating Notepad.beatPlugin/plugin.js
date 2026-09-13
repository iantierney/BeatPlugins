/*
Floating Notepad
Short description: Quickly access and edit Beat's notepad in a floating window with keyboard shortcuts.
Copyright: Bode Pickman
<Description>
  <p>The Floating Notepad plugin provides a convenient way to access and edit Beat's notepad from a floating window. 
  <br><br>
  Open header dropdown with CMD+/. 
  <br><br>
  Jump sections with ⌥↑ and ⌥↓
  <br><br>
  Toggle window with OPT+CMD+3
   <br><br>
   ⚠️WARNING: This plugin does not support color. If your notes are color-coordinated, do not use this plugin, as it will remove all colors upon launch.
   <br><br>
   </p>
</Description>
Image: floating_notepad.png
Version: 2.0
*/

const html = Beat.assetAsString("ui.html");
const notepad = Beat.notepad;

let isPanelVisible = true;
let savedPanelX = null;
let savedPanelY = null;
let savedPanelWidth = 2000;
let savedPanelHeight = 600;

function togglePanelVisibility() {
    Beat.log("togglePanelVisibility triggered");
    if (panel) {
        isPanelVisible = !isPanelVisible;
        
        if (!isPanelVisible) {
            if (typeof panel.getFrame === "function") {
                const currentFrame = panel.getFrame();
                savedPanelX = currentFrame.x;
                savedPanelY = currentFrame.y;
                savedPanelWidth = currentFrame.width;
                savedPanelHeight = currentFrame.height;
            }
            
            if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
                panel.setFrame(savedPanelX, savedPanelY, 0, 0);
            } else {
                panel.hide();
            }
        } else {
            if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
                panel.setFrame(savedPanelX, savedPanelY, savedPanelWidth, savedPanelHeight);
            } else if (typeof panel.show === "function") {
                panel.show();
            }
            refreshNotepad();
        }
    }
}

const panel = Beat.htmlWindow(html, 2000, 600, null, { utility: false });
panel.stayInMemory = true;
const frame = panel.getFrame();
panel.setFrame(frame.x, frame.y - 300, frame.width, frame.height);

let isProgrammaticUpdate = false;

Beat.custom = {
    syncNotepad(content) {
        console.log("Syncing notepad content programmatically.");
        notepad.string = content;
    }
};

Beat.onNotepadChange(() => {
    if (!isProgrammaticUpdate) {
        console.log("Notepad changed, refreshing notepad.");
        refreshNotepad();
    } else {
        console.log("Notepad changed, but skipping due to programmatic update.");
    }
});

function refreshNotepad() {
    const text = Beat.notepad.string;
    console.log("Refreshing notepad with content:", text);
    panel.call(() => {
        if (typeof simplemde === 'undefined') {
            console.log("Initializing editor with content:", text);
            initializeEditor(text);
        } else {
            console.log("Updating editor content programmatically.");
            isProgrammaticUpdate = true;
            simplemde.value(text);
            isProgrammaticUpdate = false;
        }
        if (typeof updateHeaderDropdown === 'function') {
            updateHeaderDropdown();
        }
    });
}

function syncNotepadToMain() {
    const content = simplemde.value();
    console.log("Syncing notepad to main with content:", content);
    isProgrammaticUpdate = true;
    Beat.call(
        (arg) => {
            Beat.custom.syncNotepad(arg);
            isProgrammaticUpdate = false;
        },
        content
    );
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function initializeEditor(content) {
    simplemde = new SimpleMDE({
        element: document.getElementById("notepadTextarea"),
        initialValue: content,
        spellChecker: false,
        autosave: {
            enabled: true,
            uniqueId: "floating-notepad",
            delay: 1000,
        },
        toolbar: false,
        status: false,
        previewRender: (plainText) => {
            const modifiedText = plainText.replace(/^(#+)([^#\s])/gm, '$1 $2');
            return this.parent.markdown(modifiedText);
        },
        parsingConfig: {
            allowAtxHeaderWithoutSpace: true
        },
        codeMirror: {
            mode: {
                name: "gfm",
                highlightFormatting: true,
                underscoresBreakWords: false,
                emoji: true,
            }
        }
    });

    const cm = simplemde.codemirror;

    cm.on("change", debounce(() => {
        if (!isProgrammaticUpdate) {
            console.log("Editor content changed, syncing to main.");
            syncNotepadToMain();
        } else {
            console.log("Editor content changed, but skipping due to programmatic update.");
        }
        if (typeof updateHeaderDropdown === 'function') {
            updateHeaderDropdown();
        }
    }, 500));

    cm.addKeyMap({
        "Alt-Down": (cmInstance) => navigateToNextHeading(cmInstance),
        "Alt-Up": (cmInstance) => navigateToPreviousHeading(cmInstance),
        "Enter": (cmInstance) => {
            if (!isProgrammaticUpdate) {
                syncNotepadToMain();
            }
            cmInstance.execCommand("newlineAndIndent");
        }
    });

    if (typeof updateHeaderDropdown === 'function') {
        updateHeaderDropdown();
    }
}

function navigateToNextHeading(cm) {
    const cursor = cm.getCursor();
    const lineCount = cm.lineCount();
    const headingRegex = /^#{1,6}\s+[^#]/; 
    for (let i = cursor.line + 1; i < lineCount; i++) {
        const lineText = cm.getLine(i);
        if (headingRegex.test(lineText)) {
            cm.setCursor({ line: i, ch: 0 });
            break;
        }
    }
}

function navigateToPreviousHeading(cm) {
    const cursor = cm.getCursor();
    const headingRegex = /^#{1,6}\s+[^#]/;
    for (let i = cursor.line - 1; i >= 0; i--) {
        const lineText = cm.getLine(i);
        if (headingRegex.test(lineText)) {
            cm.setCursor({ line: i, ch: 0 });
            break;
        }
    }
}

panel.call(() => {
    document.addEventListener('DOMContentLoaded', refreshNotepad);
    document.addEventListener('focus', refreshNotepad);
});

const menuItem = Beat.menuItem("Floating Notepad", ["cmd", "alt", "3"], togglePanelVisibility);
const menu = Beat.menu("Floating Notepad", [menuItem]);
