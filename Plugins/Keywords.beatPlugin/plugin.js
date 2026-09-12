/*
Title: Keywords
Copyright: Bode Pickman
<Description>
Organize your ideas and easily navigate to specific annotations in your document using hashtags or the "at" symbol (like #theme or @plot). It creates a clickable list of keywords so you can jump to them quickly, making it easier to organize, structure, and navigate your document.
Add a hashtag or "at" symbol to any inline note: [[This will create a #tag]] [[This will also create a @tag]]
<br><br>
The Annotations tab pulls every inline note, synopsis, omitted text, and notepad entry, markers, and reviews, Storyline (aka: Beat) into a searchable, filterable list. You can toggle which types to show, mark items as completed (striking them out), and click any entry to jump to its location in your document.<br><br>

Notepad entries are grouped into distinct blocks based on your active notepad grouping setting:
<br>
  • Triple Return Mode: Uses two or more consecutive blank lines to separate individual note entries.
<br><br>
  • Double Return Mode: Uses a single blank line to separate note entries.
  <br><br>
   • Create a new note by pressing cmd+rtrn
  <br><br>

In the Boneyard, notes are grouped automatically based on section headers and scene headings:
<br>
	•	A section header (#, ##, or ###) starts a new group and includes everything below it, even multiple scene headings, until the next section header.
	<br><br>
  •	If no section header is active, a scene heading (like INT. or EXT.) starts a group and includes all lines until the next scene heading or section header.
	<br><br>
  •	Text before the first section or scene heading is grouped by scene (if possible) or treated as individual entries.
<br><br>

</Description>

Image: Keywords.png
Version: 3.4
*/

// --- Global plugin state --- //

let shouldFocusNewNote = false;

// Dictionary: tagName -> array of occurrences
// Each occurrence = { lineIndex, absPos, matchLen, color, special }
let tagsByName = {};

// Flat list of all occurrences for easy removal of highlights
let allOccurrences = [];

// Remembers which occurrence index we’re currently on for each tag
let occurrenceIndex = {};

// Per-tag color dictionary, persisted in user defaults.
let tagColors = Beat.getUserDefault("tagColors") || {};

// Marker color mappings and helper utilities
const markerColors = {
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  green: '#34c759',
  teal: '#30b0c7',
  blue: '#007aff',
  purple: '#af52de',
  pink: '#ff2d55',
  brown: '#a2845e',
  gray: '#8e8e93',
  grey: '#8e8e93',
  cyan: '#32ade6',
  magenta: '#ff2d55',
  gold: '#ffd700',
  goldenrod: '#daa520',
  rose: '#ff2d55',
  cherry: '#de1738',
  buff: '#f0dc82'
};
const defaultMarkerColor = '#ffcc00';

function hexToRgba(hex, alpha = 0.18) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseMarker(content) {
  const trimmed = content.trim();

  let match = trimmed.match(/^marker\s+([a-zA-Z0-9#]+)\s*:\s*(.*)$/i);
  if (match) {
    return { color: match[1], text: match[2] };
  }

  match = trimmed.match(/^marker\s*:\s*(.*)$/i);
  if (match) {
    return { color: null, text: match[1] };
  }

  match = trimmed.match(/^marker\s+([a-zA-Z0-9#]+)\s+(.*)$/i);
  if (match) {
    const colorCandidate = match[1].toLowerCase();
    if (isValidColor(colorCandidate)) {
      return { color: match[1], text: match[2] };
    }
  }

  match = trimmed.match(/^marker\s+([a-zA-Z0-9#]+)$/i);
  if (match) {
    const colorCandidate = match[1].toLowerCase();
    if (isValidColor(colorCandidate)) {
      return { color: match[1], text: "" };
    }
  }

  match = trimmed.match(/^marker\s+(.*)$/i);
  if (match) {
    return { color: null, text: match[1] };
  }

  return { color: null, text: trimmed.replace(/^marker\s*/i, '') };
}

function isValidColor(colorStr) {
  const hexRegex = /^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/;
  if (hexRegex.test(colorStr)) return true;
  return markerColors.hasOwnProperty(colorStr.toLowerCase());
}

function stripInlineColorNotes(text) {
  return text
    .replace(/\[\[\s*([^\]]+?)\s*\]\]/g, (match, inner) => {
      const trimmed = inner.trim();
      if (isValidColor(trimmed) || isValidColor('#' + trimmed)) return '';
      return match;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isSectionHeadingLine(line) {
  return /^#{1,6}\s*/.test(line.trim());
}

function isSceneHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s*/.test(trimmed)) return false;
  const start = trimmed.replace(/^\.+/, '').trimStart();
  return /^(?:INT(?:[./-]?EXT)?|EXT|I\/E|EST|[A-Z]{2,})(?:[.\s]|$)/i.test(start);
}

function getMarkerColor(colorName) {
  if (!colorName) return defaultMarkerColor;
  const lower = colorName.toLowerCase();
  if (markerColors[lower]) return markerColors[lower];
  if (/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(colorName)) {
    return colorName;
  }
  return defaultMarkerColor;
}

// Normalize a string for stable keying/dismissal
function normalize(str) {
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\p{Emoji}\p{M}\s\-_]/gu, '') 
    .toLowerCase();
}

// Lightweight inline markdown parser
function parseInlineMarkdown(text) {
  const lines = text.split(/\r?\n|<br>/i);
  const parsedLines = lines.map(line => {
    const trimmed = line.trim();

    if (isSectionHeadingLine(line)) {
      return stripInlineColorNotes(trimmed.replace(/^#{1,6}\s*/, ''));
    }
    
    if (trimmed.startsWith('<span class="tag-pill"') || trimmed.startsWith('[[') || trimmed.startsWith('#')) {
      return line; 
    }

    if (/^###\s*[^\n#]/.test(line)) return line.replace(/^###\s*/, '');
    if (/^##\s*[^\n#]/.test(line)) return line.replace(/^##\s*/, '');
    if (/^#\s*[^\n#]/.test(line)) return line.replace(/^#\s*/, '');

    return line;
  });

  const joined = parsedLines.join("<br>");
  return joined
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

// Helper: render inline hashtags as pills
function renderInlineTags(text) {
  text = text.replace(/\[\[\s*#([\p{L}\p{N}\p{Emoji}\p{M}_-]+)\s*\]\]/gu, (_, tag) => {
    const base = pickColorForTag(tag.toLowerCase());
    const uiColor = ensureUiContrast(base);
    const fg = getContrastColor(uiColor);
    return `<span class="tag-pill" style="background-color:${uiColor}; color:${fg}; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:6px 2px;">${tag.toLowerCase()}</span>`;
  });

  text = text.replace(/\[\[\s*@([\p{L}\p{N}\p{Emoji}\p{M}_-]+)\s*\]\]/gu, (_, tag) => {
    const base = pickColorForTag(tag.toLowerCase());
    const uiColor = ensureUiContrast(base);
    const fg = getContrastColor(uiColor);
    return `<span class="tag-pill" style="background-color:${uiColor}; color:${fg}; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:6px 2px;">${tag.toLowerCase()}</span>`;
  });

  text = text.replace(/(^|\s)([#@][\p{L}\p{N}\p{Emoji}\p{M}_-]+)/gu, (_, prefix, tag) => {
    const base = pickColorForTag(tag.slice(1).toLowerCase());
    const uiColor = ensureUiContrast(base);
    const fg = getContrastColor(uiColor);
    return `${prefix}<span class="tag-pill" style="background-color:${uiColor}; color:${fg}; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:6px 2px;">${tag.slice(1).toLowerCase()}</span>`;
  });

  return text;
}

function cleanDisplayContent(text) {
  return stripInlineColorNotes(text);
}

// Array of favorite tag names, persisted in document-specific settings.
let favoriteTags = Beat.getDocumentSetting("favoriteTags") || [];

// Variables to track the tag being colored & the popup location
let activeTooltipTag = null;
let tagNameForColorPicker = null;
let colorPopupX = 0;
let colorPopupY = 0;

// Timer to refresh the tags
let timer = null;

// Poller for system appearance changes when themeMode === 'system'
let appearancePoller = null;
let _lastSystemDark = null;
let beatPoller = null;
let _lastBeatDark = null;

// Reference to plugin window
let myWindow = null;
let isPluginVisible = true;
let sizesBeforeMinimize = null;

// --- FULLSCREEN & POSITION MEMORY CONTROLLER STATE ---
let savedPluginX = null;
let savedPluginY = null;
let savedPluginWidth = 600; // Default width
let savedPluginHeight = 500; // Default height

// RECOVER STORAGE STATE
if (typeof Beat.localStorage !== 'undefined') {
  const sx = Beat.localStorage.getItem('keywords_x');
  const sy = Beat.localStorage.getItem('keywords_y');
  const sw = Beat.localStorage.getItem('keywords_w');
  const sh = Beat.localStorage.getItem('keywords_h');
  if (sx !== null) savedPluginX = Number(sx);
  if (sy !== null) savedPluginY = Number(sy);
  if (sw !== null) savedPluginWidth = Number(sw);
  if (sh !== null) savedPluginHeight = Number(sh);
}

// Theme mode
let themeMode = Beat.getUserDefault("themePreference") || "system";
let collapseMode = Beat.getUserDefault("collapseMode") || "off";

try {
  ObjC.import('Cocoa');
} catch (e) { }

// Initialize filter and tab preferences from persistent document settings
let activeTab = Beat.getDocumentSetting("activeTab") || 'keywords';
let showNotes = Beat.getDocumentSetting("showNotes");
if (showNotes === undefined) showNotes = true;
let showSynopsis = Beat.getDocumentSetting("showSynopsis");
if (showSynopsis === undefined) showSynopsis = true;
let showCompleted = Beat.getDocumentSetting("showCompleted");
if (showCompleted === undefined) showCompleted = true;
let showOmitted = Beat.getDocumentSetting("showOmitted");
if (showOmitted === undefined) showOmitted = true;
let showNotepad = Beat.getDocumentSetting("showNotepad");
if (showNotepad === undefined) showNotepad = true;
let showBoneyard = Beat.getDocumentSetting("showBoneyard");
if (showBoneyard === undefined) showBoneyard = true;
let showMarkers = Beat.getDocumentSetting("showMarkers");
if (showMarkers === undefined) showMarkers = true;
let showReviews = Beat.getDocumentSetting("showReviews");
if (showReviews === undefined) showReviews = true;
let hideBackgroundTags = Beat.getDocumentSetting("hideBackgroundTags");
if (hideBackgroundTags === undefined) hideBackgroundTags = false;
let enforceContrast = Beat.getUserDefault("enforceContrast");
if (enforceContrast === undefined) enforceContrast = true;
let notepadSplitMode = Beat.getDocumentSetting("notepadSplitMode") || 'triple';
 
let notesAndSynopsis = [];
let savedDismissed = Beat.getDocumentSetting("dismissedEntries") || [];
let dismissedEntries = new Set(savedDismissed);
let isFilterPopoutOpen = Beat.getDocumentSetting('filterPopoutOpen');
if (isFilterPopoutOpen === undefined) isFilterPopoutOpen = false;

function darkenHexColor(hex, factor = 0.2) {
  hex = hex.replace(/^#/, "");
  let r = parseInt(hex.substr(0, 2), 16);
  let g = parseInt(hex.substr(2, 2), 16);
  let b = parseInt(hex.substr(4, 2), 16);
  r = Math.floor(r * (1 - factor));
  g = Math.floor(g * (1 - factor));
  b = Math.floor(b * (1 - factor));
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  const newR = r.toString(16).padStart(2, "0");
  const newG = g.toString(16).padStart(2, "0");
  const newB = b.toString(16).padStart(2, "0");
  return `#${newR}${newG}${newB}`;
}

function getContrastColor(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000' : '#fff';
}

function _hex(h){return h.replace(/^#/,'');}
function _clamp01(x){return Math.max(0,Math.min(1,x));}
function _rgbFromHex(hex){
  const h=_hex(hex);
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16)
  };
}
function _hexFromRgb(r,g,b){
  const to2=n=>n.toString(16).padStart(2,'0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
function _rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h/=6;
  }
  return {h,s,l};
}
function _hslToRgb(h,s,l){
  function hue2rgb(p,q,t){
    if(t<0) t+=1; if(t>1) t-=1;
    if(t<1/6) return p + (q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p + (q-p)*(2/3 - t)*6;
    return p;
  }
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q = l<0.5 ? l*(1+s) : l + s - l*s;
    const p = 2*l - q;
    r = hue2rgb(p,q,h+1/3);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h-1/3);
  }
  return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) };
}

function _relLum(hex){
  const {r,g,b}=_rgbFromHex(hex);
  const f=c=>{ c/=255; return (c<=0.03928)? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
  const R=f(r), G=f(g), B=f(b);
  return 0.2126*R + 0.7152*G + 0.0722*B;
}
function _contrastRatio(a,b){
  const L1=_relLum(a), L2=_relLum(b);
  const hi=Math.max(L1,L2), lo=Math.min(L1,L2);
  return (hi+0.05)/(lo+0.05);
}
function _editorTextColor(){
  try {
    if (themeMode === 'dark') return '#E4E4E4';
    if (themeMode === 'light') return '#1B1D1E';
    return _isSystemDark() ? '#E4E4E4' : '#1B1D1E';
  } catch (e) {}
  return '#1B1D1E';
}

function _isSystemDark(){
  try {
    if (typeof ObjC !== 'undefined') {
      try {
        var ud = $.NSUserDefaults.standardUserDefaults;
        var mode = ud.objectForKey('AppleInterfaceStyle');
        return (mode && mode.toString && mode.toString() === 'Dark');
      } catch(e) {
        return false;
      }
    }
  } catch(e){}
  return false;
}

function _isBeatDark(){
  try {
    if (typeof ObjC !== 'undefined' && ObjC.classes && ObjC.classes.NSUserDefaults) {
      try {
        const bundle = 'fi.KAPITAN.Beat';
        const ud = ObjC.classes.NSUserDefaults.standardUserDefaults();
        const pd = ud.persistentDomainForName_(ObjC.classes.NSString.stringWithString(bundle));
        if (pd) {
          const desc = pd.description ? pd.description().toString().toLowerCase() : '';
          if (desc.indexOf('dark') >= 0 || desc.indexOf('appearance') >= 0 || desc.indexOf('theme') >= 0) return desc.indexOf('dark') >= 0;
        }
        const maybe = ud.objectForKey_(ObjC.classes.NSString.stringWithString('BeatAppearance')) || ud.objectForKey_(ObjC.classes.NSString.stringWithString('appearance')) || ud.objectForKey_(ObjC.classes.NSString.stringWithString('theme'));
        if (maybe && maybe.toString) {
          const s = maybe.toString().toLowerCase();
          return s.indexOf('dark') >= 0;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return false;
}

function startBeatWatcher(){
  try { if (beatPoller && beatPoller.stop) beatPoller.stop(); } catch(e){}
  _lastBeatDark = _isBeatDark();
  beatPoller = Beat.timer(1.5, function(){
    const now = _isBeatDark();
    if (now !== _lastBeatDark){
      _lastBeatDark = now;
      removeAllHighlights();
      reapplyAllHighlights();
      updateWindowUI();
    }
    startBeatWatcher();
  });
}

function startAppearanceWatcher(){
  try {
    if (appearancePoller && appearancePoller.stop) appearancePoller.stop();
  } catch(e){}
  if (themeMode !== 'system') return;
  _lastSystemDark = _isSystemDark();
  appearancePoller = Beat.timer(1.5, function(){
    const now = _isSystemDark();
    if (now !== _lastSystemDark){
      _lastSystemDark = now;
      removeAllHighlights();
      reapplyAllHighlights();
      updateWindowUI();
    }
    startAppearanceWatcher();
  });
}

function _brightness255(hex){
  const h=_hex(hex); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return (r*299 + g*587 + b*114) / 1000;
}

function _bodyBgColor(){
  if (themeMode === 'dark') return '#1e1e1e';
  return '#ffffff';
}

function ensureUiContrast(baseHex, minRatio = 3.0){
  if (!enforceContrast) return baseHex;
  const body = _bodyBgColor();
  if (_contrastRatio(body, baseHex) >= minRatio && Math.abs(_brightness255(body) - _brightness255(baseHex)) >= 48) return baseHex;

  const {r,g,b} = _rgbFromHex(baseHex);
  const {h,s,l} = _rgbToHsl(r,g,b);
  const STEP = 0.06;
  const BRIGHTNESS_GAP = 48;

  let best = null;
  function testDir(sign){
    for (let k = STEP; k <= 1.0; k += STEP){
      const L = _clamp01(l + sign * k);
      const rgb = _hslToRgb(h, s, L);
      const hex = _hexFromRgb(rgb.r, rgb.g, rgb.b);
      if (_contrastRatio(body, hex) >= minRatio){
        best = { hex, deltaL: Math.abs(L - l), dir: (sign>0 ? 'lighter' : 'darker') };
        break;
      }
      if ((sign>0 && L>=1.0) || (sign<0 && L<=0.0)) break;
    }
  }
  testDir(+1);
  const lighter = best;
  best = null;
  testDir(-1);
  const darker = best;

  let chosen = null;
  if (lighter && darker){
    chosen = (lighter.deltaL < darker.deltaL) ? lighter : (darker.deltaL < lighter.deltaL ? darker : (_contrastRatio(body, lighter.hex) >= _contrastRatio(body, darker.hex) ? lighter : darker));
  } else {
    chosen = lighter || darker;
  }
  if (!chosen) return baseHex;

  let out = chosen.hex;
  let outL = _rgbToHsl(...Object.values(_rgbFromHex(out))).l;
  while (Math.abs(_brightness255(body) - _brightness255(out)) < BRIGHTNESS_GAP || _contrastRatio(body, out) < minRatio){
    outL = _clamp01(outL + (chosen.dir === 'lighter' ? STEP : -STEP));
    const rgb = _hslToRgb(h, s, outL);
    out = _hexFromRgb(rgb.r, rgb.g, rgb.b);
    if (outL === 0 || outL === 1 || _contrastRatio(body, out) >= (minRatio + 0.5)) break;
  }
  return out;
}

function ensureBgContrastHuePreserving(baseHex, minRatio=8.0){
  const text=_editorTextColor();
  if (!enforceContrast) return baseHex;
  const BRIGHTNESS_GAP = 64;
  const STEP = 0.08;

  if (_contrastRatio(text, baseHex) >= minRatio && Math.abs(_brightness255(text) - _brightness255(baseHex)) >= BRIGHTNESS_GAP) {
    return baseHex;
  }

  const {r,g,b}=_rgbFromHex(baseHex);
  const {h,s,l}= _rgbToHsl(r,g,b);

  let best = null;

  function testDir(sign){
    for (let k=STEP; k<=1.0; k+=STEP){
      const L = _clamp01(l + sign*k);
      const rgb=_hslToRgb(h,s,L);
      const hex=_hexFromRgb(rgb.r,rgb.g,rgb.b);
      if (_contrastRatio(text, hex) >= minRatio){
        best = {hex, deltaL: Math.abs(L-l), dir: (sign>0?'lighter':'darker')};
        break;
      }
      if ((sign>0 && L>=1.0) || (sign<0 && L<=0.0)) break;
    }
  }
  testDir(+1);
  const lighter = best;
  best = null;
  testDir(-1);
  const darker = best;

  let chosen = null;
  if (lighter && darker){
    chosen = (lighter.deltaL < darker.deltaL) ? lighter : (darker.deltaL < lighter.deltaL ? darker : (_contrastRatio(text, lighter.hex) >= _contrastRatio(text, darker.hex) ? lighter : darker));
  } else {
    chosen = lighter || darker;
  }

  if (!chosen) return baseHex;

  let out = chosen.hex;
  let outL = _rgbToHsl(...Object.values(_rgbFromHex(out))).l;
  while (Math.abs(_brightness255(text) - _brightness255(out)) < BRIGHTNESS_GAP || _contrastRatio(text, out) < minRatio){
    outL = _clamp01(outL + (chosen.dir==='lighter' ? STEP : -STEP));
    const rgb=_hslToRgb(h,s,outL);
    out = _hexFromRgb(rgb.r,rgb.g,rgb.b);
    if (outL === 0 || outL === 1 || _contrastRatio(text, out) >= (minRatio + 0.5)) break;
  }
  const outHsl = _rgbToHsl(...Object.values(_rgbFromHex(out)));
  if (Math.abs(_brightness255(text) - _brightness255(out)) < BRIGHTNESS_GAP) {
    let targetL = (chosen.dir === 'lighter') ? 0.9 : 0.1;
    const rgb=_hslToRgb(h, s, targetL);
    const hexTarget=_hexFromRgb(rgb.r, rgb.g, rgb.b);
    if (_contrastRatio(text, hexTarget) >= minRatio) out = hexTarget;
  }
  
  return out;
}

function flashHighlight(color, start, length, cycles, reformatAtEnd = false) {
  if (cycles <= 0) return;
  if (cycles === 1) {
    if (reformatAtEnd) {
      Beat.reformatRange(start, length);
    } else {
      Beat.textBackgroundHighlight(color, start, length);
    }
    return;
  }
  Beat.textBackgroundHighlight(color, start, length);
  Beat.timer(0.25, function() {
    Beat.reformatRange(start, length);
    Beat.timer(0.25, function() {
      flashHighlight(color, start, length, cycles - 1, reformatAtEnd);
    });
  });
}

function blinkRange(start, length, color, numberOfTimes, interval, persistent = false){
  let remove = false;

  doBlink();

  function doBlink(){
    if(remove) {
      if (!persistent) {
        Beat.reformatRange(start, length);
      }
      numberOfTimes--;
    } else {
      Beat.textBackgroundHighlight(color, start, length);
    }

    remove = !remove;

    if(numberOfTimes){
      Beat.timer(interval, doBlink);
    }
  }
}

/**
 * Plugin methods callable from HTML.
 */
Beat.custom = {
  addNote() {
    let np = Beat.notepad.string || '';
    let currentMode = Beat.getDocumentSetting('notepadSplitMode') || 'triple';
    let separator = (currentMode === 'double') ? '\n\n' : '\n\n\n';
    if (np.length > 0) {
      np = np.replace(/\s*$/, '');
      np += separator + 'Type your note';
    } else {
      np = 'Type your note';
    }
    Beat.notepad.string = np;
    shouldFocusNewNote = true;
    Beat.custom.refreshUI();
  },
  toggleHideBackgroundTags() {
    hideBackgroundTags = !hideBackgroundTags;
    Beat.setDocumentSetting("hideBackgroundTags", hideBackgroundTags);
    Beat.custom.refreshUI();
  },
  toggleContrastEnforcement() {
    enforceContrast = !enforceContrast;
    Beat.setUserDefault("enforceContrast", enforceContrast);
    removeAllHighlights();
    reapplyAllHighlights();
    updateWindowUI();
  },
  setEnforceContrast(mode) {
    const next = (mode === 'on');
    if (next === enforceContrast) return;
    enforceContrast = next;
    Beat.setUserDefault("enforceContrast", enforceContrast);
    removeAllHighlights();
    reapplyAllHighlights();
    updateWindowUI();
  },
  setNotepadSplitMode(mode) {
    notepadSplitMode = mode;
    Beat.setDocumentSetting("notepadSplitMode", notepadSplitMode);
    Beat.custom.refreshUI();
  },
  refreshUI() {
    tagsByName = {};
    allOccurrences = [];
    occurrenceIndex = {};
    removeAllHighlights();
    gatherAllTags();
    gatherNotepadNotes();
    for (let i = favoriteTags.length - 1; i >= 0; i--) {
      const ftag = favoriteTags[i];
      if (!tagsByName[ftag]) {
        favoriteTags.splice(i, 1);
      }
    }
    Beat.setDocumentSetting("favoriteTags", favoriteTags);
    updateWindowUI();
  },

  scrollToNextOccurrence(tagName) {
    if (!tagsByName[tagName] || !tagsByName[tagName].length) return;

    const all = tagsByName[tagName];
    const docHits = all.filter(o => o.lineIndex != null && o.lineIndex >= 0);
    const reviewHits = all.filter(o => o.lineIndex === -2);
    const noteHits = all.filter(o => (o.lineIndex == null || o.lineIndex === -1) && o.lineIndex !== -2);

    if (!occurrenceIndex[tagName]) occurrenceIndex[tagName] = 0;

    const allJumpable = [...docHits, ...reviewHits];
    if (allJumpable.length === 0) {
      if (noteHits.length > 0) {
        Beat.alert("Note in Notepad", "This keyword was found in your Notepad.");
      }
      return;
    }

    const index = occurrenceIndex[tagName] % allJumpable.length;
    const occ = allJumpable[index];

    if (occ) {
      if (occ.lineIndex === -2) {
        Beat.scrollTo(occ.absPos);
        flashHighlight(occ.color, occ.absPos, occ.matchLen, 3, true);
      } else if (occ.lineIndex >= 0) {
        const lines = Beat.lines();
        if (lines[occ.lineIndex]) {
          Beat.scrollTo(lines[occ.lineIndex].position);
          flashHighlight(occ.color, occ.absPos, occ.matchLen, 3, false);
        }
      }
      occurrenceIndex[tagName]++;
      updateWindowUI();
    }
  },

  handlePillClick(tagName) {
    activeTooltipTag = tagName;
    updateWindowUI();
    Beat.custom.scrollToNextOccurrence(tagName);
  },

  handleTagRightClick(tagName, x, y) {
    tagNameForColorPicker = tagName;
    colorPopupX = x;
    colorPopupY = y;
    updateWindowUI();
  },

  finalizeTagColor(newColor) {
    if (!tagNameForColorPicker) return;
    tagColors[tagNameForColorPicker] = newColor;
    Beat.setUserDefault("tagColors", tagColors);
    removeAllHighlights();
    reapplyAllHighlights();
    tagNameForColorPicker = null;
    updateWindowUI();
  },

  previewTagColor(newColor) {
    if (!tagNameForColorPicker) return;
    tagColors[tagNameForColorPicker] = newColor;
    removeAllHighlights();
    reapplyAllHighlights();
  },

  onPillMouseLeave(tagName) {
    if (activeTooltipTag === tagName) {
      activeTooltipTag = null;
      updateWindowUI();
    }
  },

  dropToFavorites(tagName) {
    if (!favoriteTags.includes(tagName)) {
      favoriteTags.push(tagName);
      Beat.setDocumentSetting("favoriteTags", favoriteTags);
      updateWindowUI();
    }
  },

  dropToOthers(tagName) {
    const idx = favoriteTags.indexOf(tagName);
    if (idx >= 0) {
      favoriteTags.splice(idx, 1);
      Beat.setDocumentSetting("favoriteTags", favoriteTags);
      updateWindowUI();
    }
  },

  switchTab(tab) {
    activeTab = tab;
    if (tab === 'keywords') {
      reapplyAllHighlights();
    }
    Beat.setDocumentSetting("activeTab", tab);
    updateWindowUI();
  },

  toggleFilter(type) {
    if (type === 'notes') {
      showNotes = !showNotes;
      Beat.setDocumentSetting("showNotes", showNotes);
    }
    if (type === 'synopsis') {
      showSynopsis = !showSynopsis;
      Beat.setDocumentSetting("showSynopsis", showSynopsis);
    }
    if (type === 'omitted') {
      showOmitted = !showOmitted;
      Beat.setDocumentSetting("showOmitted", showOmitted);
    }
    if (type === 'notepad') {
      showNotepad = !showNotepad;
      Beat.setDocumentSetting("showNotepad", showNotepad);
    }
    if (type === 'markers') {
      showMarkers = !showMarkers;
      Beat.setDocumentSetting("showMarkers", showMarkers);
    }
    if (type === 'boneyard') {
      showBoneyard = !showBoneyard;
      Beat.setDocumentSetting("showBoneyard", showBoneyard);
    }
    if (type === 'review') {
      showReviews = !showReviews;
      Beat.setDocumentSetting("showReviews", showReviews);
    }
    updateWindowUI();
  },

  toggleShowCompleted() {
    showCompleted = !showCompleted;
    Beat.setDocumentSetting("showCompleted", showCompleted);
    updateWindowUI();
  },
  
  setFilterSetting(type, state) {
    try {
      const val = !!state;
      if (type === 'notes') { showNotes = val; Beat.setDocumentSetting('showNotes', showNotes); }
      else if (type === 'markers') { showMarkers = val; Beat.setDocumentSetting('showMarkers', showMarkers); }
      else if (type === 'synopsis') { showSynopsis = val; Beat.setDocumentSetting('showSynopsis', showSynopsis); }
      else if (type === 'omitted') { showOmitted = val; Beat.setDocumentSetting('showOmitted', showOmitted); }
      else if (type === 'boneyard') { showBoneyard = val; Beat.setDocumentSetting('showBoneyard', showBoneyard); }
      else if (type === 'notepad') { showNotepad = val; Beat.setDocumentSetting('showNotepad', showNotepad); }
      else if (type === 'review') { showReviews = val; Beat.setDocumentSetting('showReviews', showReviews); }
      else if (type === 'completed') { showCompleted = val; Beat.setDocumentSetting('showCompleted', showCompleted); }
    } catch (e) {}
  },

  setFilterPopout(state) {
    try {
      isFilterPopoutOpen = !!state;
      Beat.setDocumentSetting('filterPopoutOpen', isFilterPopoutOpen);
      updateWindowUI();
    } catch (e) {}
  },

  toggleFilterWithPopout(type) {
    try {
      isFilterPopoutOpen = true;
      Beat.setDocumentSetting('filterPopoutOpen', true);
      if (type === 'notes') {
        showNotes = !showNotes; Beat.setDocumentSetting('showNotes', showNotes);
      }
      if (type === 'synopsis') {
        showSynopsis = !showSynopsis; Beat.setDocumentSetting('showSynopsis', showSynopsis);
      }
      if (type === 'omitted') {
        showOmitted = !showOmitted; Beat.setDocumentSetting('showOmitted', showOmitted);
      }
      if (type === 'notepad') {
        showNotepad = !showNotepad; Beat.setDocumentSetting('showNotepad', showNotepad);
      }
      if (type === 'markers') {
        showMarkers = !showMarkers; Beat.setDocumentSetting('showMarkers', showMarkers);
      }
      if (type === 'boneyard') {
        showBoneyard = !showBoneyard; Beat.setDocumentSetting('showBoneyard', showBoneyard);
      }
      if (type === 'review') {
        showReviews = !showReviews; Beat.setDocumentSetting('showReviews', showReviews);
      }
      if (type === 'completed') {
        showCompleted = !showCompleted; Beat.setDocumentSetting('showCompleted', showCompleted);
      }
      updateWindowUI();
    } catch (e) {}
  },
  
  openReview(reviewIndexStr) {
    const idx = parseInt(reviewIndexStr, 10);
    if (isNaN(idx)) return;
    try {
      let reviewLocation = -1;
      const reviews = Beat.reviews?.getReviews?.() || [];
      const rev = reviews[idx];
      if (rev && Beat.reviews && typeof Beat.reviews.rangeForReview === 'function') {
        const range = Beat.reviews.rangeForReview(rev);
        if (range && range.location !== undefined) reviewLocation = range.location;
      }

      if (reviewLocation < 0) {
        const entry = notesAndSynopsis.find(n => n.type === 'review' && n.reviewIndex === idx);
        if (entry && entry.absPos >= 0) reviewLocation = entry.absPos;
      }

      if (reviewLocation >= 0) {
        Beat.scrollTo(reviewLocation);
        try { flashHighlight('#aad8ff', reviewLocation, 1, 3, true); } catch (e) {}
      }
    } catch (e) {}
  },

  toggleTheme() {
    isDarkTheme = !isDarkTheme;
    Beat.setUserDefault("themePreference", isDarkTheme);
    updateWindowUI();
  },

  forceReapplyHighlights() {
    try { Beat.log('[KW] Manual reapply requested'); } catch(e){}
    removeAllHighlights();
    reapplyAllHighlights();
    updateWindowUI();
  },

  toggleDismissed(key) {
    if (dismissedEntries.has(key)) {
      dismissedEntries.delete(key);
    } else {
      dismissedEntries.add(key);
    }
    Beat.setDocumentSetting("dismissedEntries", Array.from(dismissedEntries));
    updateWindowUI();
  },

  scrollToMetaEntry(posStr) {
    const position = parseInt(posStr, 10);
    if (isNaN(position)) return;

    const lines = Beat.lines();
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = line.position;
      const lineEnd = i < lines.length - 1 ? lines[i + 1].position : Infinity;

      if (position >= lineStart && position < lineEnd) {
        const rangeLength = Math.max(1, line.string.length - 1);
        blinkRange(lineStart, rangeLength, "#aad8ff", 3, 0.25, false);
        Beat.scrollTo(lineStart);
        found = true;
        break;
      }
    }

    if (!found) {
      try {
        Beat.scrollTo(position);
      } catch (e) {}
    }
  },

  setLightMode() {
    themeMode = "light";
    Beat.setUserDefault("themePreference", themeMode);
    removeAllHighlights();
    reapplyAllHighlights();
    try { if (appearancePoller && appearancePoller.stop) appearancePoller.stop(); } catch(e){}
    updateWindowUI();
  },

  setDarkMode() {
    themeMode = "dark";
    Beat.setUserDefault("themePreference", themeMode);
    removeAllHighlights();
    reapplyAllHighlights();
    try { if (appearancePoller && appearancePoller.stop) appearancePoller.stop(); } catch(e){}
    updateWindowUI();
  },

  setSystemMode() {
    themeMode = "system";
    Beat.setUserDefault("themePreference", themeMode);
    removeAllHighlights();
    reapplyAllHighlights();
    startAppearanceWatcher();
    updateWindowUI();
  },

  setThemeMode(mode) {
    themeMode = mode;
    Beat.setUserDefault("themePreference", mode);
    removeAllHighlights();
    reapplyAllHighlights();
    if (mode === 'system') startAppearanceWatcher(); else try { if (appearancePoller && appearancePoller.stop) appearancePoller.stop(); } catch(e){}
    updateWindowUI();
  },

  toggleLightDark() {
    try {
      if (themeMode === 'dark') {
        this.setLightMode();
      } else {
        this.setDarkMode();
      }
    } catch (e) {}
  },

  setCollapseMode(mode) {
    collapseMode = mode;
    Beat.setUserDefault("collapseMode", mode);
    updateWindowUI();
  },

  minimizeFTOutliner() {
    if (collapseMode !== "off" && myWindow) {
      if (!sizesBeforeMinimize) {
        sizesBeforeMinimize = myWindow.getFrame();
      }
      const { x: origX, y: origY, width: origW, height: origH } = sizesBeforeMinimize;
      const newWidth = Math.floor(origW * 0.25);
      const newX = (collapseMode === "right")
                 ? (origX + origW - newWidth)
                 : origX;
      const newY = origY + origH - 28;
      myWindow.setFrame(newX, newY, newWidth, 28);
    }
  },

  maximizeFTOutliner() {
    if (myWindow && sizesBeforeMinimize) {
      const { x, y, width, height } = sizesBeforeMinimize;
      myWindow.setFrame(x, y, width, height);
      sizesBeforeMinimize = null;
    }
  },
};

function main() {
  gatherAllTags();
  gatherNotepadNotes();

  Beat.onNotepadChange(() => {
    Beat.custom.refreshUI();
  });

  if (!Object.keys(tagsByName).length && notesAndSynopsis.length === 0) {
    Beat.alert("No Keywords or Notes Found", "Try adding a hashtag within an inline note (e.g., [[This is a #keyword]]).");
    Beat.end();
    return;
  }

  Beat.onTextChange(() => {
    timer?.stop();
    timer = Beat.timer(1.5, () => {
      Beat.custom.refreshUI();
    });
  });

  const ui = buildUIHtml();

  myWindow = Beat.htmlWindow(ui, savedPluginWidth, savedPluginHeight, onWindowClosed, { utility: false });
  myWindow.stayInMemory = true;
  myWindow.resizable = true;

  if (savedPluginX !== null && savedPluginY !== null) {
      if (typeof myWindow.setFrame === "function") {
          myWindow.setFrame(savedPluginX, savedPluginY, savedPluginWidth, savedPluginHeight);
      }
  } else {
      centerWindow(myWindow);
  }

  if (typeof myWindow.onMove === "function") {
      myWindow.onMove(function() {
          syncKeywordsCoordinates();
      });
  }
}

function gatherNotepadNotes() {
  notesAndSynopsis = notesAndSynopsis.filter(entry => !entry.key?.startsWith("notepad:"));

  const np = Beat.notepad?.string || '';
  if (!np) return;

  const lines = np.split('\n');
  let blocks = [];
  let currentBlock = [];
  let blockStartIdx = 0;
  let blankCount = 0;
  
  const splitThreshold = (notepadSplitMode === 'double') ? 1 : 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '') {
      blankCount++;
      if (blankCount >= splitThreshold) {
        if (currentBlock.length > 0) {
          blocks.push({ lines: [...currentBlock], startIndex: blockStartIdx });
          currentBlock = [];
        }
        blockStartIdx = i + 1; 
      } else {
        if (currentBlock.length > 0) {
          currentBlock.push(line);
        } else {
          blockStartIdx = i + 1;
        }
      }
    } else {
      blankCount = 0;
      if (currentBlock.length === 0) blockStartIdx = i;
      currentBlock.push(line);
    }
  }
  
  if (currentBlock.length > 0) {
    blocks.push({ lines: [...currentBlock], startIndex: blockStartIdx });
  }

  if (blocks.length === 0 && np.trim() !== '') {
    blocks = [{ lines: lines, startIndex: 0 }];
  }

  blocks.forEach((blk, j) => {
    while (blk.lines.length > 0 && blk.lines[blk.lines.length - 1].trim() === '') {
      blk.lines.pop();
    }
    
    let content = blk.lines.join('<br>').trim();
    if (!content) return;
    
    const absPos = 90000000 + j;
    const key = `notepad:${j}`;
    notesAndSynopsis.push({
      type: 'note',
      content,
      absPos,
      lineIndex: blk.startIndex,
      key
    });
  });
}

function onWindowClosed() {
  removeAllHighlights();
  Beat.end();
}

function gatherAllTags() {
  let insideBoneyardSection = false;
  const boneyardHeaderRegex = /^#\s*BONEYARD/i;
  const regexNote = /\[\[(.*?)\]\]/g;
  const regexHash = /[#@]([\p{L}\p{N}\p{Emoji}\p{M}_-]+)/gu;
  const lines = Beat.lines();

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].string.trim();
    if (boneyardHeaderRegex.test(trimmedLine)) {
      insideBoneyardSection = true;
    }
    if (/^#\s+/.test(trimmedLine) && !boneyardHeaderRegex.test(trimmedLine)) {
      insideBoneyardSection = false;
    }
    if (insideBoneyardSection && hideBackgroundTags) {
      continue;
    }
    const lineObj = lines[i];

    if (/^\s*=/.test(lineObj.string)) {
      const synopsisSource = lineObj.string.replace(/\[\[.*?\]\]/g, match => ' '.repeat(match.length));
      let synopsisTagMatch;
      while ((synopsisTagMatch = regexHash.exec(synopsisSource)) !== null) {
        const tagName = synopsisTagMatch[1].toLowerCase();
        if (/^[a-fA-F0-9]{6}$/.test(tagName)) continue;
        const absPos = lineObj.position + synopsisTagMatch.index;
        const matchLen = synopsisTagMatch[0].length;
        if (!alreadyHaveOccurrence(absPos, matchLen)) {
          addOccurrence(tagName, i, absPos, matchLen);
        }
      }
    }

    let noteMatch;
    while ((noteMatch = regexNote.exec(lineObj.string)) !== null) {
      const noteContent = noteMatch[1];
      const isSynopsisLine = /^\s*=/.test(lineObj.string);
      if (isSynopsisLine && (isValidColor(noteContent.trim()) || isValidColor('#' + noteContent.trim()))) {
        continue;
      }
      let hashMatch;
      while ((hashMatch = regexHash.exec(noteContent)) !== null) {
        const tagName = hashMatch[1].toLowerCase();
        if (/^[a-fA-F0-9]{6}$/.test(tagName)) continue;
        const absPos = lineObj.position + noteMatch.index + 2 + hashMatch.index;
        const matchLen = hashMatch[0].length;
        if (!alreadyHaveOccurrence(absPos, matchLen)) {
          addOccurrence(tagName, i, absPos, matchLen);
        }
      }
    }
  }

  notesAndSynopsis = [];
  let insideBoneyard = false;
  insideBoneyardSection = false;
  for (let i = 0; i < lines.length; i++) {
    const lineObj = lines[i];
    const line = lineObj.string;
    let noteMatch;
    while ((noteMatch = regexNote.exec(line)) !== null) {
      if (insideBoneyardSection) continue;
      const content = noteMatch[1].trim();

      const isColor = isValidColor(content) || isValidColor("#" + content);
      const isSceneLine = isSceneHeadingLine(line);
      const isSectionLine = isSectionHeadingLine(line);
      const isSynopsisLine = /^\s*=/.test(line);

      if (isColor && (isSceneLine || isSectionLine || isSynopsisLine)) {
        continue;
      }

      if (/^#[a-fA-F0-9]{6}$/.test(content.trim())) continue;
      const absPos = lineObj.position + noteMatch.index;
      const trimmed = content.trim();
      const specialMatch = trimmed.match(/^\s*(beat|storyline)\b\s*[:]?(?:\s+([^\]]+))?$/i);
      if (specialMatch) {
        const entryContent = specialMatch[2]?.trim() || specialMatch[1].toUpperCase();
        notesAndSynopsis.push({
          type: 'note',
          content: entryContent,
          cleanContent: entryContent,
          markerBgColor: null,
          markerBorderColor: null,
          absPos,
          lineIndex: i,
          key: `note:${normalize(content)}`
        });
        continue;
      }
      if (
        !/^[#@]([\p{L}\p{N}\p{Emoji}\p{M}_-]+)$/u.test(trimmed) &&
        !line.trim().startsWith('=')
      ) {
        let type = 'note';
        let entryContent = content;
        let markerBgColor = null;
        let markerBorderColor = null;
        if (/^marker\b/i.test(trimmed)) {
          type = 'marker';
          const parsedMarker = parseMarker(content);
          entryContent = parsedMarker.text;
          const resolvedColor = getMarkerColor(parsedMarker.color);
          markerBgColor = hexToRgba(resolvedColor, 0.18);
          markerBorderColor = resolvedColor;
        }
        notesAndSynopsis.push({
          type,
          content: entryContent,
          cleanContent: entryContent,
          markerBgColor,
          markerBorderColor,
          absPos,
          lineIndex: i,
          key: `${type}:${normalize(content)}`
        });
      }
    }

    const trimmedLine = line.trim().toLowerCase();
    if (trimmedLine === "manual page break" || trimmedLine === "===") {
      notesAndSynopsis.push({ type: 'synopsis', content: '**Forced Page Break**', absPos: lineObj.position, lineIndex: i, key: `synopsis:${normalize('**Forced Page Break**')}` });
      continue;
    }

    if (line.includes("/*")) {
      let j = i;
      let blockLines = [line];
      let foundEnd = line.includes("*/");

      while (!foundEnd && j + 1 < lines.length) {
        j++;
        blockLines.push(lines[j].string);
        if (lines[j].string.includes("*/")) {
          foundEnd = true;
        }
      }

      const fullBlock = blockLines.join("\n").trim();

      const previewText = stripInlineColorNotes(fullBlock)
        .replace(/^\/\*/, "")
        .replace(/\*\/$/, "")
        .replace(/^\s*#{1,6}\s*/, "")
        .trim()
        .slice(0, 100);

      notesAndSynopsis.push({
        type: 'omitted',
        content: '**🚫 Omitted:** ' + previewText,
        absPos: lineObj.position,
        lineIndex: i,
        key: `omitted:${i}`
      });

      i = j;
      continue;
    }

    const trimmed = line.trim();
    if (/^#\s*BONEYARD/i.test(trimmed)) {
      const bLines = [];
      for (let k = i + 1; k < lines.length; k++) {
        bLines.push({ text: lines[k].string, position: lines[k].position, index: k });
      }

      const sectionRegex = /^#\s*(.*)$/;
      const sceneRegex   = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|INT-EXT\.)/i;

      const bBlocks     = [];
      let currentBlock  = null;

      bLines.forEach(({ text: bText, position: bPos, index: bIdx }) => {
        const trimmed = bText.trim();
        const sectionMatch = trimmed.match(sectionRegex);
        if (sectionMatch) {
          if (currentBlock) bBlocks.push(currentBlock);
          currentBlock = {
            header: stripInlineColorNotes(sectionMatch[1].trim()),
            lines: [],
            startIndex: bIdx,
            startPos: bPos
          };
          return;
        }

        if (currentBlock && currentBlock.header) {
          currentBlock.lines.push(bText);
          return;
        }

        const isSceneHeading = sceneRegex.test(trimmed);

        if (isSceneHeading) {
          if (currentBlock) bBlocks.push(currentBlock);
          currentBlock = {
            header: null,
            lines: [bText],
            startIndex: bIdx,
            startPos: bPos
          };
        } else if (trimmed !== '' || (currentBlock && currentBlock.lines.length)) {
          if (!currentBlock) {
            currentBlock = {
              header: null,
              lines: [bText],
              startIndex: bIdx,
              startPos: bPos
            };
          } else {
            currentBlock.lines.push(bText);
          }
        }
      });

      if (currentBlock) bBlocks.push(currentBlock);

      bBlocks.forEach(blk => {
        const contentLines = [];
        if (blk.header) contentLines.push(blk.header);
        contentLines.push(...blk.lines);
        notesAndSynopsis.push({
          type: 'boneyard',
          content: contentLines.join('<br>').trim(),
          absPos: blk.startPos,
          lineIndex: blk.startIndex,
          key: `boneyard:${blk.startIndex}`
        });
      });
      break;
    }

    if (/^#\s+/.test(trimmed) && !/^#\s*BONEYARD/i.test(trimmed)) {
      insideBoneyard = false;
      insideBoneyardSection = false;
    }

    if (line.trim() === "==" || line.trim() === "===") continue;
    const isSynopsisLine = /^=\s?(.*)/.test(line);
    if (isSynopsisLine && !insideBoneyardSection) {
      const rawContent = line.replace(/^=\s?/, '');
      const content = stripInlineColorNotes(rawContent);
      if (!content.trim()) continue;
      const absPos = lineObj.position + line.indexOf('=');
      const specialTagOnly = /^\s*(new\s*)?\[\[\s*(beat|storyline)\s*:?\s+[^\]]+\]\]\s*$/i.test(content.trim());
      if (specialTagOnly) continue;
      if (/^#[a-fA-F0-9]{6}$/.test(content.trim())) continue;
      notesAndSynopsis.push({ type: 'synopsis', content, absPos, lineIndex: i, key: `synopsis:${normalize(content)}` });
    }
  }

  try {
    const reviews = Beat.reviews?.getReviews?.() || [];
    const reviewTagRegex = /[@#][\p{L}\p{N}\p{Emoji}\p{M}_-]+/gu;
    reviews.forEach(review => {
      if (review && review.string) {
        let reviewLocation = -1;
        try {
          if (Beat.reviews && typeof Beat.reviews.rangeForReview === 'function') {
            const range = Beat.reviews.rangeForReview(review);
            if (range && range.location !== undefined) {
              reviewLocation = range.location;
            }
          }
        } catch (e) {}
        
        let tagMatch;
        while ((tagMatch = reviewTagRegex.exec(review.string)) !== null) {
          const tagName = tagMatch[0].replace(/^[@#]/, '').toLowerCase();
          if (tagName && !/^[a-fA-F0-9]{6}$/.test(tagName)) {
            addTag(tagName, pickColorForTag(tagName), {
              lineIndex: -2,
              absPos: reviewLocation,
              matchLen: tagName.length,
              special: false,
              reviewOffset: tagMatch.index
            });
          }
        }
      }
    });
  } catch (e) {}

  try {
    const reviews = Beat.reviews?.getReviews?.() || [];
    reviews.forEach((review, index) => {
      if (review && review.string) {
        let reviewLocation = -1;
        try {
          if (Beat.reviews && typeof Beat.reviews.rangeForReview === 'function') {
            const range = Beat.reviews.rangeForReview(review);
            if (range && range.location !== undefined) {
              reviewLocation = range.location;
            }
          }
        } catch (e) {}
        
        const reviewText = review.string.trim();
        if (reviewText) {
          notesAndSynopsis.push({
            type: 'review',
            content: reviewText,
            absPos: reviewLocation,
            lineIndex: -2,
            key: `review:${index}`,
            reviewIndex: index
          });
        }
      }
    });
  } catch (e) {}

  const np = Beat.notepad?.string || '';
  if (np) {
    const notepadLines = np.split(/\n/);
    const tagRegex = /\[\[\s*(#?[^\]\s]+(?:\s+[^\]\s]+)*)\s*\]\]/g;
    notepadLines.forEach(line => {
      const stripped = line.trim();
      let tagMatch;
      while ((tagMatch = tagRegex.exec(stripped)) !== null) {
        const fullMatch = tagMatch[1].trim();
        if (/^(beat|storyline)\b[:\s]/i.test(fullMatch)) {
          const tagName = fullMatch.replace(/^(beat|storyline)\b[:\s]*/i, '').trim().toLowerCase();
          if (tagName) {
            addTag(tagName, pickColorForTag(tagName), { lineIndex: -1, absPos: -1, matchLen: tagName.length, special: true });
          }
        } else {
          const tagName = fullMatch.replace(/^#/, '').trim().toLowerCase();
          if (tagName) {
            addTag(tagName, pickColorForTag(tagName), { lineIndex: -1, absPos: -1, matchLen: tagName.length, special: false });
          }
        }
      }
    });
  }
  notesAndSynopsis.sort((a, b) => a.absPos - b.absPos);
}

function addTag(tagName, color, occurrence) {
  if (!tagsByName[tagName]) tagsByName[tagName] = [];
  if (!tagsByName[tagName].some(o =>
    o.lineIndex === occurrence.lineIndex &&
    o.absPos === occurrence.absPos &&
    o.matchLen === occurrence.matchLen &&
    o.special === occurrence.special &&
    (o.reviewOffset === occurrence.reviewOffset || (o.reviewOffset === undefined && occurrence.reviewOffset === undefined))
  )) {
    tagsByName[tagName].push({ tag: tagName, ...occurrence, color });
    allOccurrences.push({ tag: tagName, ...occurrence, color });
  }
}

function addOccurrence(tagName, lineIndex, absPos, matchLen, special = false) {
  const baseColor = pickColorForTag(tagName);
  const hl = ensureBgContrastHuePreserving(baseColor, 8.0);
  Beat.textBackgroundHighlight(hl, absPos, matchLen);
  const occurrence = { tag: tagName, lineIndex, absPos, matchLen, color: hl, special };
  if (!tagsByName[tagName]) {
    tagsByName[tagName] = [];
  }
  tagsByName[tagName].push(occurrence);
  allOccurrences.push(occurrence);
}

function alreadyHaveOccurrence(absPos, matchLen) {
  return allOccurrences.some(o => o.absPos === absPos && o.matchLen === matchLen);
}

function pickColorForTag(tagName) {
  if (tagColors[tagName]) return tagColors[tagName];
  return "#687d9d";
}

function reapplyAllHighlights() {
  for (const occ of allOccurrences) {
    if (occ.lineIndex === -2) continue;
    
    const baseColor = pickColorForTag(occ.tag);
    const hl = ensureBgContrastHuePreserving(baseColor, 8.0);
    Beat.textBackgroundHighlight(hl, occ.absPos, occ.matchLen);
    occ.color = hl;
  }
}

/// HTML UI

function buildUIHtml() {
  let popupStyle = "display:none;";
  let colorInputValue = "#fefbc0";
  if (tagNameForColorPicker) {
    popupStyle = `
      display:block;
      position:absolute;
      top:${colorPopupY}px;
      left:${colorPopupX}px;
      background:#444;
      padding:8px;
      border-radius:8px;
      z-index:999;
    `;
    colorInputValue = pickColorForTag(tagNameForColorPicker);
  }

  let css;
  if (themeMode === "system") {
    css = `
    :root {
      --bodyBg: #fff;
      --bodyColor: #000;
      --headerColor: #666;
      --helpBg: #f1f1f1;
      --helpColor: #000;
      --searchBg: #fff;
      --searchColor: #000;
      --searchBorder: #ccc;
      --notepadBg: rgba(232, 241, 255, 0.5);
      --boneyardBg: rgba(255, 236, 236, 0.5);
      --synopsisBg: rgba(248, 250, 255, 0.5);
      --reviewBg: #f4e9bf;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bodyBg: #1e1e1e;
        --bodyColor: #eee;
        --headerColor: #aaa;
        --helpBg: #2a2a2a;
        --helpColor: #fff;
        --searchBg: #2a2a2a;
        --searchColor: #fff;
        --searchBorder: #444;
        --notepadBg: rgba(34, 48, 63, 0.5);
        --boneyardBg: rgba(68, 38, 38, 0.5);
        --synopsisBg: rgba(37, 42, 51, 0.5);
        --reviewBg: #70653a;
      }
    }
    @media (prefers-color-scheme: light) {
      select {
        color-scheme: light;
      }
      select::-ms-expand,
      select::after {
        filter: brightness(0.2);
      }
      select::-webkit-inner-spin-button,
      select::-webkit-outer-spin-button,
      select::-webkit-dropdown-arrow {
        filter: brightness(0.2);
      }
    }
    `;
  } else if (themeMode === "light") {
    css = `
    :root {
      --bodyBg: #fff;
      --bodyColor: #000;
      --headerColor: #666;
      --helpBg: #f1f1f1;
      --helpColor: #000;
      --searchBg: #fff;
      --searchColor: #000;
      --searchBorder: #ccc;
      --notepadBg: rgba(232, 241, 255, 0.5);
      --boneyardBg: rgba(255, 236, 236, 0.5);
      --synopsisBg: rgba(248, 250, 255, 0.55);
      --reviewBg: #f4e9bf;
    }
    @media (prefers-color-scheme: light) {
      select {
        color-scheme: light;
      }
      select::-ms-expand,
      select::after {
        filter: brightness(0.2);
      }
      select::-webkit-inner-spin-button,
      select::-webkit-outer-spin-button,
      select::-webkit-dropdown-arrow {
        filter: brightness(0.2);
      }
    }
    `;
  } else {
    css = `
    :root {
      --bodyBg: #1e1e1e;
      --bodyColor: #eee;
      --headerColor: #aaa;
      --helpBg: #2a2a2a;
      --helpColor: #fff;
      --searchBg: #2a2a2a;
      --searchColor: #fff;
      --searchBorder: #444;
      --notepadBg: rgba(34, 48, 63, 0.5);
      --boneyardBg: rgba(68, 38, 38, 0.5);
      --synopsisBg: rgba(37, 42, 51, 0.5);
      --reviewBg: #70653a;
    }`;
  }

  let html = `
<html>
<head>
  <style>
    ${css}
    select {
      font-family: inherit;
      border: none;
      outline: none;
      box-shadow: none;
    }
    #themeTabs select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-color: var(--helpBg);
      color: var(--helpColor);
      border: 1px solid var(--searchBorder);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.85em;
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 12px 16px;
      padding-right: 24px;
    }
    @media (prefers-color-scheme: dark) {
      #themeTabs select {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="16" viewBox="0 0 12 16"><path d="M3.5 6l2.5-2 2.5 2" stroke="%23ccc" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M3.5 10l2.5 2 2.5-2" stroke="%23ccc" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>');
      }
    }
    @media (prefers-color-scheme: light) {
      #themeTabs select {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="16" viewBox="0 0 12 16"><path d="M3.5 6l2.5-2 2.5 2" stroke="%23333" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M3.5 10l2.5 2 2.5-2" stroke="%23333" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>');
      }
    }
    #themeTabs select:hover,
    #themeTabs select:focus {
      border-color: var(--headerColor);
      background-color: var(--searchBg);
    }
    #themeTabs select option {
      background: var(--bodyBg);
      color: var(--bodyColor);
    }
    #noteSearchInput {
      width: 100%;
      padding: 6px 10px;
      font-size: 0.95em;
      border-radius: 6px;
      border: 1px solid var(--searchBorder, #ccc);
      background-color: var(--searchBg, #fff);
      color: var(--searchColor, #000);
    }
    html, body {
      margin: 0;
      padding: 5px;
      background: var(--bodyBg);
      color: var(--bodyColor);
      font-family: sans-serif;
      min-height: 100vh;
    }
    h1 {
      margin: 0.4em 0 0.2em 0;
      font-size: 2em;
      font-weight: bold;
    }
    h2 {
      margin: 0.35em 0 0.2em 0;
      font-size: 1.5em;
      font-weight: bold;
    }
    h3 {
      margin: 0.3em 0 0.2em 0;
      font-size: 1em;
      font-weight: bold;
    }
    .container {
      margin-bottom: 1em;
      min-height: 50px;
      border: 2px dashed #555;
      padding: 8px;
      border-radius: 6px;
    }
    .container.drag-over {
      border-color: #bbb;
    }
    .tag-pill {
      display: inline-block;
      margin: 4px 6px 4px 0;
      cursor: pointer;
      padding: 3px 8px;
      border-radius: 20px;
      font-size: 0.9em;
      user-select: none;
      position: relative;
    }
    .tooltip {
      display: none;
      position: absolute;
      bottom: -24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.8em;
      white-space: nowrap;
      z-index: 100;
    }
    .tag-pill:hover .tooltip, .tag-pill.active .tooltip {
      display: block;
    }
    #helpIcon {
      position: fixed;
      bottom: 10px;
      left: 10px;
      cursor: pointer;
      font-size: 1.5em;
      color: #aaa;
      z-index: 1002;
    }
    #helpPopover {
      display: none;
      position: fixed;
      bottom: 40px;
      left: 10px;
      background: var(--helpBg);
      color: var(--helpColor);
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      z-index: 1001;
      max-width: 300px;
      font-size: 0.9em;
      line-height: 1.4em;
    }
    #helpPopover button {
      margin-top: 10px;
      display: block;
    }
    #themeTabs {
      position: fixed;
      bottom: 10px;
      right: 5px;
      width: auto;
      text-align: right;
      z-index: 1002;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    #themeTabs:hover,
    #themeTabs:focus-within {
      opacity: 1;
      pointer-events: auto;
    }
    body.show-controls #themeTabs {
      opacity: 1;
      pointer-events: auto;
    }
    .themeTab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      padding: 6px 12px;
      font-size: 0.9em;
      font-weight: 500;
      color: var(--bodyColor);
      cursor: pointer;
      transition: border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    }
    .themeTab:hover {
      border-bottom: 2px solid var(--headerColor);
    }
    .themeTab.active {
      border-bottom: 2px solid var(--headerColor);
      font-weight: 600;
    }
    .tab-bar {
      margin-bottom: 10px;
      text-align: left;
    }
    .meta-block {
      background: var(--helpBg);
      color: var(--bodyColor);
      padding: 6px 10px;
      border-radius: 6px;
      margin: 6px 0;
      font-size: 0.95em;
      word-break: break-word;
    }
    .meta-block.notepad-note {
      background: var(--notepadBg);
    }
    .meta-block.boneyard-note {
      background: var(--boneyardBg);
    }
    .meta-block.synopsis-note {
      background: var(--helpBg);
    }
    .meta-block.review-note {
      background: var(--reviewBg);
    }
    .review-label {
      margin-left: 10px;
      color: var(--headerColor);
      opacity: 0.65;
      font-size: 0.9em;
      font-weight: 500;
      white-space: nowrap;
    }
    .meta-block.marker-note {
      border-left-width: 3px;
      border-left-style: solid;
    }
    .meta-block:not(.notepad-note):not(.boneyard-note):not(.synopsis-note):not(.review-note) {
      background: color-mix(in srgb, var(--helpBg) 90%, black 10%);
    }
    .filter-toggles {
      margin-bottom: 10px;
    }
    .filter-toggles label {
      margin-right: 18px;
      font-size: 0.98em;
      cursor: pointer;
    }
    .filter-btn {
      background: var(--helpBg);
      border: 1px solid var(--searchBorder);
      color: var(--bodyColor);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.9em;
      cursor: pointer;
      transition: background-color 0.2s ease;
      margin-bottom: 0;
    }
    .filter-btn:hover {
      background-color: var(--searchBg);
      border-color: var(--headerColor);
    }
    .filter-popout {
      display: none;
      position: absolute;
      top: 48px;
      left: 8px;
      background: var(--bodyBg);
      border: 1px solid var(--searchBorder);
      border-radius: 8px;
      padding: 12px;
      z-index: 100;
      min-width: 220px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .filter-popout.active { display: block; }
    .filter-popout label { display:flex; align-items:center; margin-bottom:8px; }
    .filter-popout label input { margin-right:8px }
    input[type="checkbox"] {
      accent-color: var(--headerColor);
      color-scheme: light dark;
      width: 14px;
      height: 14px;
      cursor: pointer;
    }
    .sticky-header {
      position: sticky;
      top: 0;
      background: var(--bodyBg);
      z-index: 10;
      padding-top: 8px;
    }
    .sticky-header input,
    .sticky-header .tab-bar,
    .sticky-header .filter-toggles {
      margin-bottom: 8px;
    }
    @media (prefers-color-scheme: dark) {
      .sticky-header {
        background: var(--bodyBg);
      }
    }
  </style>
  <script>
    function minimizeFTOutliner() {
      Beat.call('Beat.custom.minimizeFTOutliner()');
    }
    function maximizeFTOutliner() {
      Beat.call('Beat.custom.maximizeFTOutliner()');
    }
    window.addEventListener('blur', minimizeFTOutliner);
    window.addEventListener('focus', maximizeFTOutliner);
    window.addEventListener('keydown', function(e){
      try {
        if (e.metaKey && e.ctrlKey && (e.key === '0' || e.key === '0')){
          e.preventDefault();
          Beat.call('Beat.custom.toggleLightDark()');
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          const active = document.activeElement;
          const isEditing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true' || active.tagName === 'SELECT');
          if (!isEditing) {
            e.preventDefault();
            Beat.call('Beat.custom.addNote()');
          }
        }
      } catch(err){}
    });
  </script>
  <style>
    #footerBar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 10px;
      z-index: 1002;
      pointer-events: none;
    }
    #footerBar > * {
      pointer-events: auto;
    }
  </style>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      var footer = document.getElementById('footerBar');
      function show() { document.body.classList.add('show-controls'); }
      function hideSoon() {
        setTimeout(function () {
          if (!(footer && footer.matches(':hover'))) {
            document.body.classList.remove('show-controls');
          }
        }, 120);
      }
      if (footer) {
        footer.addEventListener('mouseenter', show);
        footer.addEventListener('mouseleave', hideSoon);
        footer.addEventListener('focusin', show);
        footer.addEventListener('focusout', hideSoon);
      }
    });
  </script>
</head>
<body>
  <div class="sticky-header">
    <div class="tab-bar">
      <button class="themeTab ${activeTab==='keywords'?'active':''}" onclick="Beat.call('Beat.custom.switchTab(\\'keywords\\')')">Keywords</button>
      <button class="themeTab ${activeTab==='notes'?'active':''}" onclick="Beat.call('Beat.custom.switchTab(\\'notes\\')')">Annotations</button>
    </div>
`;

  if (activeTab === 'notes') {
    html += `
      <input type="text" id="noteSearchInput" placeholder="Search annotations..." 
             oninput="window.filterNotes(this.value)">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <div style="position:relative;">
          <button class="filter-btn" onclick="Beat.call('Beat.custom.setFilterPopout(true)')">Filters ▾</button>
          <div id="filterPopout" class="filter-popout ${isFilterPopoutOpen ? 'active' : ''}">
            <label><input type="checkbox" ${showNotes ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'notes\\')')"> Notes</label>
            <label><input type="checkbox" ${showMarkers ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'markers\\')')"> Markers</label>
            <label><input type="checkbox" ${showSynopsis ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'synopsis\\')')"> Synopsis</label>
            <label><input type="checkbox" ${showOmitted ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'omitted\\')')"> Omits</label>
            <label><input type="checkbox" ${showBoneyard ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'boneyard\\')')"> Boneyard</label>
            <label><input type="checkbox" ${showNotepad ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'notepad\\')')"> Notepad</label>
            <label><input type="checkbox" ${showReviews ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'review\\')')"> Reviews</label>
            <label><input type="checkbox" ${showCompleted ? 'checked' : ''} onchange="Beat.call('Beat.custom.toggleFilterWithPopout(\\'completed\\')')"> Show completed</label>
            <div style="display:flex; justify-content:flex-end; margin-top:8px;"><button onclick="Beat.call('Beat.custom.setFilterPopout(false)')">Close</button></div>
          </div>
        </div>

        <label style="font-size: 0.85em; display: flex; align-items: center; gap: 4px; color: var(--headerColor);" title="Notepad notes are grouped together, using your preferred line return setting to separate individual entries.">
          Notepad grouping:
          <select onchange="Beat.call('Beat.custom.setNotepadSplitMode(\\'' + this.value + '\\')')" style="background-color: var(--helpBg); color: var(--helpColor); border: 1px solid var(--searchBorder); padding: 4px 6px; border-radius: 6px; font-size: 0.9em;">
            <option value="triple" ${notepadSplitMode==='triple'?'selected':''}>Triple Return</option>
            <option value="double" ${notepadSplitMode==='double'?'selected':''}>Double Return</option>
          </select>
        </label>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
        <span style="font-size: 0.9em; color: #666;"></span>
        <button class="add-note-btn" title="Add note to Notepad"
          onmouseenter="window._hoverScroll = setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)"
          onmouseleave="clearTimeout(window._hoverScroll)"
          onclick="Beat.call('Beat.custom.addNote()')">+ Add Note</button>
      </div>
    </div>     `;
    let notepadNoteIndex = 0;
    for (const [index, entry] of notesAndSynopsis.entries()) {
      const entryKey = entry.key || `${entry.type}:${entry.lineIndex ?? entry.absPos}`;
      const isOmitted = entry.type === 'omitted';
      const isBoneyard = entry.type === 'boneyard';
      const isNotepadNote = (
        entry.type === 'note' &&
        (entry.lineIndex === undefined || entry.absPos >= 90000000 || entry.key?.startsWith('notepad:')) &&
        (entry.sceneIndex === undefined && entry.range === undefined)
      );
      const isSynopsis = entry.type === 'synopsis';
      const isReview = entry.type === 'review';
      const isMarkerEntry = entry.type === 'marker';
      if (
        (
          (entry.type === 'note' && ((isNotepadNote && showNotepad) || (!isNotepadNote && showNotes))) ||
          (entry.type === 'marker' && showMarkers) ||
          (entry.type === 'synopsis' && showSynopsis) ||
          (entry.type === 'omitted' && showOmitted) ||
          (entry.type === 'boneyard' && showBoneyard) ||
          (entry.type === 'review' && showReviews)
        ) &&
        (showCompleted || !dismissedEntries.has(entryKey)) &&
        (showOmitted || !isOmitted)
      ) {
        const isDismissed = dismissedEntries.has(entryKey);
        const checked = isDismissed ? 'checked' : '';
        const style = isDismissed ? 'text-decoration: line-through; opacity: 0.5;' : '';
        let displayContent = isMarkerEntry ? entry.cleanContent : cleanDisplayContent(entry.content);
        if (displayContent.length > 1000) {
          displayContent = displayContent.slice(0, 1000) + '…';
        }
        let parsed = parseInlineMarkdown(displayContent);
        parsed = renderInlineTags(parsed);
        const heartbeatSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
        
        if (/\b(beat|storyline)\b/i.test(displayContent)) {
          parsed = heartbeatSvg + parsed;
        }

        parsed = parsed.replace(/\[\[(.*?)\]\]/g, '$1');
        const reviewLabelHtml = isReview ? `<div class="review-label">Located in Review</div>` : '';
        let boneyardAttr = isBoneyard ? ' data-is-boneyard="true"' : '';
        const dataOriginal = entry.content.replace(/"/g, '&quot;');
        if (isNotepadNote) {
          const tagOnlyContent = (entry.content.match(/\[\[\s*[@#][\p{L}\p{N}\p{Emoji}\p{M}_-]+\s*\]\]/gu) || []).join(' ');
          const renderedTagsHTML = renderInlineTags(tagOnlyContent);
          const hintId = `hint-${notepadNoteIndex++}`;
          html += `
            <div class="meta-block notepad-note" data-type="note" style="display: flex; flex-direction: column; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
              <div style="display: flex; align-items: center;">
                <input type="checkbox" ${checked} onclick="event.stopPropagation(); Beat.call('Beat.custom.toggleDismissed(\\'${entryKey}\\')')" style="margin-right: 8px;">
               <div
                  class="editable-note"
                  contenteditable="true"
                  onkeydown="if (event.key === 'Enter') { 
                    if (event.metaKey || event.ctrlKey) {
                      this.blur();
                      event.preventDefault();
                      event.stopPropagation();
                    } else {
                      document.execCommand('insertLineBreak'); 
                      event.preventDefault(); 
                    }
                  }"
                  onblur="(function(el){
                    const newContent = el.innerText;
                    Beat.call((newVal) => {
                      const lines = Beat.notepad.string.split('\\n');
                      const index = ${entry.lineIndex !== undefined ? entry.lineIndex : 0};
                      const newLines = newVal.split('\\n');
                      lines.splice(index, newLines.length, ...newLines);
                      Beat.notepad.string = lines.join('\\n');
                      Beat.custom.refreshUI();
                    }, newContent);
                  })(this)"
                  style="white-space: pre-wrap; flex: 1; ${style};"
                >${parseInlineMarkdown(entry.content)}</div>
                <button onclick="Beat.call(() => {
                  const lines = Beat.notepad.string.split('\\n');
                  lines.splice(${entry.lineIndex}, 1);
                  Beat.notepad.string = lines.join('\\n');
                  Beat.custom.refreshUI();
                })"
                style="margin-left: 8px; background: transparent; border: none; color: #888; font-size: 1.2em; cursor: pointer;">×</button>
                <div id="${hintId}" class="note-hint" style="display:none; margin-left:8px; color:#888; font-size:0.85em; font-style:italic; user-select:none; margin-top:4px;">Note in Notepad</div>
              </div>
              ${renderedTagsHTML.trim() ? `<div class="rendered-tags" style="margin-top:4px; font-size:0.85em; color:#999; opacity:0.8;">${renderedTagsHTML}</div>` : ''}
            </div>
          `;
        } else {
          let inlineStyle = 'display: flex; align-items: center;';
          if (isMarkerEntry && entry.markerBorderColor) {
            inlineStyle += ` background: ${entry.markerBgColor}; border-left: 3px solid ${entry.markerBorderColor};`;
          }
          html += `
            <div class="meta-block${isBoneyard ? ' boneyard-note' : ''}${isSynopsis ? ' synopsis-note' : ''}${isReview ? ' review-note' : ''}${isMarkerEntry ? ' marker-note' : ''}" data-type="${entry.type}" data-original="${dataOriginal}"${boneyardAttr} style="${inlineStyle}">
              <input type="checkbox" ${checked} onclick="event.stopPropagation(); Beat.call('Beat.custom.toggleDismissed(\\'${entryKey}\\')')" style="margin-right: 8px;">
              ${isReview ?
                `<div style="white-space: pre-wrap; cursor:pointer; ${style}; flex: 1;" onclick="Beat.call('Beat.custom.openReview(\\'${entry.reviewIndex}\\')')">${parsed}</div>` :
                `<div style="white-space: pre-wrap; cursor:pointer; ${style}; flex: 1;" onclick="Beat.call('Beat.custom.scrollToMetaEntry(\\'${entry.absPos}\\')')">${parsed}</div>`}
              ${reviewLabelHtml}
            </div>
          `;
        }
      }
    }
    html += `
      <button class="add-note-btn" title="Add note to Notepad (cmd+rtrn)"
        onmouseenter="window._hoverScroll = setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)"
        onmouseleave="clearTimeout(window._hoverScroll)"
        onclick="Beat.call('Beat.custom.addNote()')">+ Add Note</button>
    `;
    html += `
<style>
  .note-hint {
    margin-left: 8px;
    color: #888;
    font-size: 0.85em;
    font-style: italic;
    user-select: none;
    transition: display 0.2s;
  }
  .pill.special {
    display: inline-block;
    margin: 0 3px 0 0;
    padding: 2px 8px;
    border-radius: 16px;
    background: transparent;
    border: 2px solid #687d9d;
    color: #687d9d;
    font-size: 0.9em;
    font-weight: 600;
    vertical-align: middle;
  }
  .add-note-btn {
    position: fixed;
    bottom: 10px;
    right: 15px;
    background-color: #687d9d;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 0.9em;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .add-note-btn:hover {
    background-color: #506082;
  }
</style>
<script>
  window.filterNotes = function(query) {
    const blocks = document.querySelectorAll('.meta-block');
    query = query.toLowerCase();
    blocks.forEach(block => {
      let text = block.getAttribute('data-original') || block.innerText;
      text = text.replace(/<br\\s*\\/?>/gi, ' ').toLowerCase();
      block.style.display = text.includes(query) ? 'flex' : 'none';
    });
  };

  window.shouldFocusNewNote = ${shouldFocusNewNote};
  if (window.shouldFocusNewNote) {
    setTimeout(() => {
      const editableNotes = document.querySelectorAll('.editable-note');
      if (editableNotes.length > 0) {
        const lastNote = editableNotes[editableNotes.length - 1];
        if (lastNote.innerText.trim() === 'Type your note') {
          lastNote.focus();
          const range = document.createRange();
          range.selectNodeContents(lastNote);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          lastNote.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 60);
  }
</script>
</body></html>
`;
    return html;
  }

  html += `
  <div class="sticky-header">
    <input type="text" id="keywordSearchInput" placeholder="Search keywords..." 
           oninput="window.filterKeywords(this.value)"
           style="width: 100%; padding: 6px 10px; font-size: 0.95em; border-radius: 6px; border: 1px solid var(--searchBorder, #ccc); background-color: var(--searchBg, #fff); color: var(--searchColor, #000);">
    <label style="margin-top: 6px; display:block;" title="Hide Keywords in Notepad, Boneyard, Omits, and Reviews.">
      <input type="checkbox" ${hideBackgroundTags ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleHideBackgroundTags()')">
      Show Keywords in Screenplay Only
    </label>
    <h2>Favorites</h2>
  </div>
  <div id="favoritesContainer" class="container"
       ondragover="event.preventDefault(); this.classList.add('drag-over');"
       ondragleave="this.classList.remove('drag-over');"
       ondrop="(function(e){ e.preventDefault(); this.classList.remove('drag-over'); var tag = e.dataTransfer.getData('text/plain'); Beat.call('Beat.custom.dropToFavorites(\\'' + tag + '\\')'); }).call(this, event)">
  `;

  for (const ftag of favoriteTags) {
    if (hideBackgroundTags) {
      const occs = tagsByName[ftag];
      if (!occs || occs.every(o => {
        const entry = notesAndSynopsis.find(n => n.lineIndex === o.lineIndex);
        return o.lineIndex === -1 || o.lineIndex === -2 || (entry && ['omitted', 'boneyard'].includes(entry.type));
      })) continue;
    }
    const occurrences = tagsByName[ftag] || [];
    const isSpecial = occurrences.some(o => o.special === true);
    const baseColor = pickColorForTag(ftag);
    const color = ensureUiContrast(baseColor);
    const borderColor = darkenHexColor(color, 0.2);
    const notepadCount = occurrences.filter(o => o.lineIndex === -1).length;
    const reviewCount = occurrences.filter(o => o.lineIndex === -2).length;
    const docCount = occurrences.filter(o => o.lineIndex >= 0).length;
    const jumpableCount = docCount + reviewCount;
    const pos = (occurrenceIndex[ftag] != null && jumpableCount > 0 ? (occurrenceIndex[ftag] % jumpableCount) : 0) + 1;
    const pillClass = (activeTooltipTag === ftag) ? "tag-pill active" : "tag-pill";
    let pillStyle;
    if (isSpecial) {
      pillStyle = `background-color:transparent; border:2px solid ${color}; color:${color};`;
    } else {
      pillStyle = `background-color:${color}; border:1px solid ${borderColor}; color:${getContrastColor(color)};`;
    }
    let tagLabel = ftag.split(/\s+/)[0];
    if (isSpecial) {
      const heartbeatSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
      tagLabel = heartbeatSvg + tagLabel;
    }
    const notepadOnly = occurrences.every(o => o.lineIndex === -1);
    let locationText;
    if (notepadOnly) {
      locationText = 'in Notepad';
    } else if (docCount > 0 && reviewCount > 0) {
      locationText = 'in document (also in Reviews)';
    } else if (reviewCount > 0) {
      locationText = 'in Reviews';
    } else {
      locationText = 'in document';
    }
    html += `
    <div class="${pillClass}"
         style="${pillStyle}"
         draggable="true"
         ondragstart="event.dataTransfer.setData('text/plain','${ftag}');"
         ${notepadOnly ? '' : `onclick="Beat.call('Beat.custom.handlePillClick(\\'${ftag}\\')')"`}
         onmouseleave="Beat.call('Beat.custom.onPillMouseLeave(\\'${ftag}\\')')"
         oncontextmenu="event.preventDefault(); Beat.call('Beat.custom.handleTagRightClick(\\'${ftag}\\', ' + event.clientX + ', ' + event.clientY + ')');">
      ${tagLabel}
      <span class="tooltip">
        ${notepadOnly ? '' : `${pos}/${jumpableCount}`} ${locationText}
      </span>
    </div>
    `;
  }

  html += `
  </div>
  <div id="othersContainer" class="container" style="border:none; background:transparent;"
       ondragover="event.preventDefault(); this.classList.add('drag-over');"
       ondragleave="this.classList.remove('drag-over');"
       ondrop="(function(e){ e.preventDefault(); this.classList.remove('drag-over'); var tag = e.dataTransfer.getData('text/plain'); Beat.call('Beat.custom.dropToOthers(\\'' + tag + '\\')'); }).call(this, event)">
  `;

  const allTagNames = Object.keys(tagsByName);
  const otherTags = allTagNames.filter(t => {
    if (favoriteTags.includes(t)) return false;
    if (!hideBackgroundTags) return true;
    const occs = tagsByName[t];
    return occs.some(o => {
      const entry = notesAndSynopsis.find(n => n.lineIndex === o.lineIndex);
      return o.lineIndex !== -1 && o.lineIndex !== -2 && (!entry || !['omitted', 'boneyard'].includes(entry.type));
    });
  });
  if (!otherTags.length) {
    html += `<p style="color:#999;">No other keywords found.</p>`;
  } else {
    for (const tagName of otherTags) {
      const occurrences = tagsByName[tagName];
      const isSpecial = occurrences.some(o => o.special === true);
      const baseColor = pickColorForTag(tagName);
      const color = ensureUiContrast(baseColor);
      const borderColor = darkenHexColor(color, 0.2);
      const notepadCount = occurrences.filter(o => o.lineIndex === -1).length;
      const reviewCount = occurrences.filter(o => o.lineIndex === -2).length;
      const docCount = occurrences.filter(o => o.lineIndex >= 0).length;
      const jumpableCount = docCount + reviewCount;
      const pos = (occurrenceIndex[tagName] != null && jumpableCount > 0 ? (occurrenceIndex[tagName] % jumpableCount) : 0) + 1;
      const pillClass = (activeTooltipTag === tagName) ? "tag-pill active" : "tag-pill";
      let pillStyle;
      if (isSpecial) {
        pillStyle = `background-color:transparent; border:2px solid ${color}; color:${color};`;
      } else {
        pillStyle = `background-color:${color}; border:1px solid ${borderColor}; color:${getContrastColor(color)};`;
      }
      let tagLabel = tagName.split(/\s+/)[0];
      if (isSpecial) {
        const heartbeatSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
        tagLabel = heartbeatSvg + tagLabel;
      }
      const notepadOnly = occurrences.every(o => o.lineIndex === -1);
      let locationText;
      if (notepadOnly) {
        locationText = 'in Notepad';
      } else if (docCount > 0 && reviewCount > 0) {
        locationText = 'in document (also in Reviews)';
      } else if (reviewCount > 0) {
        locationText = 'in Reviews';
      } else {
        locationText = 'in document';
      }
      html += `
      <div class="${pillClass}"
           style="${pillStyle}"
           draggable="true"
           ondragstart="event.dataTransfer.setData('text/plain','${tagName}');"
           ${notepadOnly ? '' : `onclick="Beat.call('Beat.custom.handlePillClick(\\'${tagName}\\')')"`}
           onmouseleave="Beat.call('Beat.custom.onPillMouseLeave(\\'${tagName}\\')')"
           oncontextmenu="event.preventDefault(); Beat.call('Beat.custom.handleTagRightClick(\\'${tagName}\\', ' + event.clientX + ', ' + event.clientY + ')');">
        ${tagLabel}
        <span class="tooltip">
          ${notepadOnly ? '' : `${pos}/${jumpableCount}`} ${locationText}
        </span>
      </div>
      `;
    }
  }

  html += `
  </div>
  <div id="colorPopup" style="${popupStyle}">
    <input type="color" id="colorPickerInput" value="${colorInputValue}"
           oninput="Beat.call('Beat.custom.previewTagColor(\\'' + this.value + '\\')')"
           onblur="Beat.call('Beat.custom.finalizeTagColor(\\'' + this.value + '\\')')">
    <button onclick="finalizeColorButtonClick()">OK</button>
  </div>
  <div id="footerBar">
    <div id="helpIcon" onclick="document.getElementById('helpPopover').style.display = (document.getElementById('helpPopover').style.display=='block'?'none':'block');">?</div>
    <div id="helpPopover">
      <p>Add a hashtag (#) or at-sign (@) inside an inline note in your document to create a tag. For example: [[This creates a #tag]] and [[This creates an @tag]].</p>
      <p>You can also tag Storylines/Beats: [[Storyline: #tag]] or [[Beat #tag]].</p>
      <p>Click a tag in the plugin to jump to its location in the document.</p>
      <p>Left click to change the color of a tag.</p>
      <p>Use Ctrl+Cmd+K to toggle the plugin window.</p>
      <p>Use Shift+Cmd+K to toggle the highlights.</p>
      <p>Use Shift+Cmd+0 to toggle theme.</p>
      <button onclick="document.getElementById('helpPopover').style.display='none';">Close</button>
    </div>
    <div id="themeTabs">
      <label style="margin-right:12px;">
        Auto-collapse:
        <select onchange="Beat.call('Beat.custom.setCollapseMode(\\'' + this.value + '\\')')">
          <option value="off"   ${collapseMode==='off'   ? 'selected' : ''}>Off</option>
          <option value="left"  ${collapseMode==='left'  ? 'selected' : ''}>Left</option>
          <option value="right" ${collapseMode==='right' ? 'selected' : ''}>Right</option>
        </select>
      </label>
      <label style="margin-right:12px;">
        Highlight Contrast:
        <select onchange="Beat.call('Beat.custom.setEnforceContrast(\\'' + this.value + '\\')')">
          <option value="on"  ${enforceContrast ? 'selected' : ''}>On</option>
          <option value="off" ${!enforceContrast ? 'selected' : ''}>Off</option>
        </select>
      </label>
      <label style="margin-right:12px;">
        Theme:
        <select onchange="Beat.call('Beat.custom.setThemeMode(\\'' + this.value + '\\')')">
          <option value="off"   disabled>Type</option>
          <option value="light"  ${themeMode==='light'  ? 'selected' : ''}>Light</option>
          <option value="dark"   ${themeMode==='dark'   ? 'selected' : ''}>Dark</option>
        </select>
      </label>
    </div>
  </div>
<script>
  window.filterKeywords = function(query) {
    const pills = document.querySelectorAll('.tag-pill');
    query = query.toLowerCase();
    pills.forEach(pill => {
      const text = pill.innerText.toLowerCase();
      pill.style.display = text.includes(query) ? 'inline-block' : 'none';
    });
  };
</script>
</body>
</html>
`;
  return html;
}

function updateWindowUI() {
  if (!myWindow) return;

  const newHTML = `
    <script>
      window.addEventListener('beforeunload', function() {
        sessionStorage.setItem('scrollY', window.scrollY);
      });
      window.addEventListener('DOMContentLoaded', function() {
        const y = sessionStorage.getItem('scrollY') || 0;
        window.scrollTo(0, parseInt(y, 10));
      });
      window.addEventListener('scroll', function() {
        sessionStorage.setItem('scrollY', window.scrollY);
      });
    </script>
  ` + buildUIHtml();

  myWindow.setHTML(newHTML);
  shouldFocusNewNote = false; 
}

function removeAllHighlights() {
  for (const occ of allOccurrences) {
    Beat.removeBackgroundHighlight(occ.absPos, occ.matchLen);
  }
}

function centerWindow(winObj) {
  if (typeof Beat.screenWidth === "function" && typeof Beat.screenHeight === "function") {
    const frame = winObj.getFrame();
    const x = (Beat.screenWidth() - frame.width) / 2;
    const y = (Beat.screenHeight() - frame.height) / 2;
    winObj.setFrame(x, y, frame.width, frame.height);
  } else {
    Beat.log("Screen dimensions not available for centering.");
  }
}

function reapplyAllHighlights() {
  for (const occ of allOccurrences) {
    if (occ.lineIndex === -2) continue;
    
    const baseColor = pickColorForTag(occ.tag);
    const hl = ensureBgContrastHuePreserving(baseColor, 8.0);
    Beat.textBackgroundHighlight(hl, occ.absPos, occ.matchLen);
    occ.color = hl;
  }
}

let keywordsHighlightsOn = true;

function toggleKeywordsHighlights() {
  Beat.log("toggleKeywordsHighlights triggered");
  keywordsHighlightsOn = !keywordsHighlightsOn;
  
  if (!keywordsHighlightsOn) {
    removeAllHighlights();
    Beat.log("Keywords highlights removed from view.");
  } else {
    reapplyAllHighlights();
    Beat.log("Keywords highlights reapplied to view.");
  }
}

function syncKeywordsCoordinates() {
    if (myWindow && typeof myWindow.getFrame === "function") {
        const currentFrame = myWindow.getFrame();
        if (currentFrame.x > -5000 && currentFrame.width > 0 && currentFrame.height > 0) {
            savedPluginX = currentFrame.x;
            savedPluginY = currentFrame.y;
            savedPluginWidth = currentFrame.width;
            savedPluginHeight = currentFrame.height;

            if (typeof Beat.localStorage !== 'undefined') {
                Beat.localStorage.setItem('keywords_x', savedPluginX);
                Beat.localStorage.setItem('keywords_y', savedPluginY);
                Beat.localStorage.setItem('keywords_w', savedPluginWidth);
                Beat.localStorage.setItem('keywords_h', savedPluginHeight);
            }
        }
    }
}

function togglePluginVisibility() {
  Beat.log("togglePluginVisibility triggered");
  if (myWindow) {
    isPluginVisible = !isPluginVisible;
    
    if (!isPluginVisible) {
      syncKeywordsCoordinates();

      if (typeof myWindow.setFrame === "function" && savedPluginX !== null && savedPluginY !== null) {
        myWindow.setFrame(savedPluginX, savedPluginY, 0, 0);
      } else {
        myWindow.hide();
      }
    } else {
      if (typeof myWindow.show === "function") {
          myWindow.show();
      }

      if (typeof myWindow.setFrame === "function" && savedPluginX !== null && savedPluginY !== null) {
        myWindow.setFrame(savedPluginX, savedPluginY, savedPluginWidth, savedPluginHeight);
      } else if (typeof centerWindow === "function") {
        if (typeof myWindow.setFrame === "function") { myWindow.setFrame(100, 100, savedPluginWidth, savedPluginHeight); }
        centerWindow(myWindow);
      }
    }
  } else {
    main();
    isPluginVisible = true;
  }
}

const toggleWindowMenuItem = Beat.menuItem("Toggle Window", ["cmd", "ctrl", "k"], togglePluginVisibility);
const toggleHighlightsMenuItem = Beat.menuItem("Toggle Highlights", ["cmd", "shift", "k"], toggleKeywordsHighlights);
const toggleThemeMenuItem = Beat.menuItem("Toggle Theme", ["cmd", "ctrl", "0"], function(){ try { Beat.custom.toggleLightDark(); } catch(e){} });

Beat.menu("Keywords", [
  toggleWindowMenuItem,
  toggleHighlightsMenuItem,
  toggleThemeMenuItem
]);

main();
