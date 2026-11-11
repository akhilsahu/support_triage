 
The left side should have **two layers**:

### **1\. Simple visual controls**

Purpose determines the available family:

Business  
Clean / Professional / Technical / Warm

Creator  
Editorial / Visual / Bold / Warm

Person  
Minimal / Personal / Editorial / Professional

Organization  
Community / Trustworthy / Editorial / Bold

Aura preselects the recommended one based on subtype/content.

Then a few additional choices only:

Landing emphasis  
Balanced / Visual / Services / Local / Minimal

Accent  
curated colors

Background  
Light / Soft / Dark

Assets  
Logo / hero / portfolio images

No dozens of controls.

### **2\. Appearance chat**

Below those controls:

> “Use this photo as the hero.”  
> “Make this feel more premium.”  
> “Show my portfolio before services.”  
> “Use less yellow.”  
> “Make the intro more visual.”

Aura translates those requests into the same structured config used by the controls.

So manual controls and chat are editing **one presentation object**, not two separate systems.

Example:

{  
  "themePreset": "business\_clean",  
  "landingEmphasis": "services",  
  "hero": {  
    "assetId": "asset\_123",  
    "layout": "image\_right"  
  },  
  "sections": \[  
    "identity",  
    "services",  
    "portfolio",  
    "prompt\_starters"  
  \]  
}

React renders the preview.

## **The right preview is important**

It should show the **real public Yullo experience**, not a fake website mockup.

Initial state:

logo

Northstar Studio  
Brand & product design for startups

short intro

Services  
Brand Strategy · Product Design · UX

Featured work  
\[ visual \]

\[ What do you offer? \]  
\[ Show me your work \]

\[ Ask Northstar anything... \]

Then preview mode should allow actually sending a test message.

The intro stays the first block in the scroll area:

Landing intro  
↓  
visitor message  
↓  
Aura response  
↓  
rich UI

So the owner sees exactly how landing → conversation behaves.

## **How much freedom should Aura get?**

Aura can change:

theme preset  
landing emphasis  
section order  
section visibility  
hero treatment  
asset placement  
background treatment  
accent family  
density  
prompt presentation  
rich UI style

Aura should **not** generate:

raw React  
raw HTML  
CSS  
JavaScript  
arbitrary pixel positions  
random fonts

That keeps every Yullo Link responsive and maintainable.

## **Assets make this much stronger**

An owner uploads, say, 5 images.

Aura can respond:

> I’d use the second image as the hero and the fourth as featured work.

Preview updates immediately.

The user can say:

> “No, use the third one.”

This is where the chatbot becomes genuinely useful instead of just being another settings UI.

## **Apply model**

Every change should affect preview immediately but remain a draft:

Undo   Redo   Reset to Aura   Save appearance

No AI change silently goes public.

So the combined product model becomes:

> **Left \= quick choices \+ conversational designer. Right \= actual live Yullo Link preview.**

And underneath, both are just editing one constrained `presentationConfig`. That is the version I’d build.

 
A few concrete details:

* **Left preview area:** soft neutral canvas, centered preview frame, enough margin around it so it feels like a real object being designed.  
* **Right inspector:** fixed/sticky width around `360–420px`, subtle divider on the left, same Yullo app theme.  
* **Preview frame:** not a fake browser chrome. Just the actual Yullo Link surface with optional device toggle: `Desktop / Mobile`.  
* **Top bar:** `Appearance` on left, then `Undo`, `Redo`, `Reset`, `Save appearance` on right.  
* **Controls:** use grouped sections with lots of whitespace, not cards:  
  * Theme  
  * Landing emphasis  
  * Accent  
  * Background  
  * Assets  
  * Aura designer  
* **Theme options:** small visual swatches/mini previews, not radio buttons.  
* **Assets:** thumbnails with `Use as hero`, `Use in work`, `Remove`.  
* **Aura chat:** anchored near the bottom of the right panel, compact and always available.  
* **Live update:** every manual or chat change updates preview instantly, but remains draft until Save.  
* **Motion:** subtle crossfade/token transitions, around `180–220ms`; no flashy morphing.  
* **Dark mode:** inspector follows app/system theme; preview follows the Space theme.

Roughly:

┌──────────────────────────────────────────┬─────────────────────┐  
│ Appearance preview                       │ Appearance          │  
│                                          │                     │  
│        \[ actual Yullo Link \]             │ Theme               │  
│                                          │ \[mini presets\]      │  
│                                          │                     │  
│                                          │ Landing emphasis    │  
│                                          │ \[ Balanced \]        │  
│                                          │                     │  
│                                          │ Accent              │  
│                                          │ ● ● ● ●             │  
│                                          │                     │  
│                                          │ Assets              │  
│                                          │ \[ img \]\[ img \]      │  
│                                          │                     │  
│                                          │ Aura designer       │  
│                                          │ “Use this image…”   │  
│                                          │ \[ Ask Aura... \]     │  
└──────────────────────────────────────────┴─────────────────────┘

The key is: **preview should dominate visually; controls should feel secondary and precise.**

Yes — but keep it restrained and useful.

For the Appearance editor I’d use motion mainly in 4 places:

* **Theme change:** preview crossfades/tokens transition over \~180–220ms.  
* **Section reordering:** use `layout` animations so sections slide into their new position instead of jumping.  
* **Asset placement:** when an image becomes hero/featured, fade \+ scale very slightly into place.  
* **Aura-generated changes:** briefly highlight the changed area with a soft outline/glow pulse, then fade.

Good defaults:

duration: 0.18–0.24  
ease: \[0.22, 1, 0.36, 1\]

Use `layout`/`layoutId` only where it helps continuity.

Avoid:

* bouncy springs  
* dramatic zooms  
* entire preview flying around  
* shimmer  
* constant animated background

The motion should make the user feel:

> “the page is being redesigned in front of me”

not:

> “the UI is showing off.”\


 

The Appearance editor should feel more like a **creative workspace** than a SaaS settings screen.

So avoid:

- stacked cards
- lots of labeled toggles
- dense form groups
- pills everywhere
- “Settings / Save / Cancel” visual language

Instead:

- large live preview as the main canvas
- right-side inspector with mostly **visual choices**
- theme presets as mini visual thumbnails
- asset strip with images
- a compact Aura designer chat at the bottom
- section controls that feel like editing a composition, not configuring software

A better right panel would feel like:

```
Appearance

For your Business
[ Clean Editorial ] [ Technical ] [ Warm ]

Focus
Balanced · Services · Visual

Assets
[ img ][ img ][ + ]

Background
Soft   Dark   Light

────────────

Ask Aura
“Make the hero more visual”
[ message... ]
```

The preview should dominate and show the **actual landing-to-chat experience**, not a fake webpage mockup. That matches the direction we already established: real public preview, constrained theme families, few controls, and Aura editing the same presentation object rather than generating raw code. Yullo Link Design

For motion, theme and section changes should happen directly on the canvas — subtle crossfades, section reordering, asset placement — so it feels like the Space is being designed live.

The target feeling is closer to:

> **creative editor / spatial canvas**

than:

> **SaaS configuration panel**.