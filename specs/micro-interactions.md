# Page Micro-Interactions

Add subtle CSS transitions and micro-interactions to all interactive elements across the site, enhancing the warm, handcrafted feel without adding JavaScript complexity.

## Motivation

The current site has minimal interactive feedback — only 3 CSS transitions exist (border-color on the email input and background on the two submit buttons, all `0.2s`). Hover state changes on links and focus outlines appear instantly with no transition. Adding smooth transitions to all interactive state changes creates a more polished, intentional feel that matches the indie, handcrafted aesthetic.

## Design Principles

- **CSS only**: All micro-interactions are implemented in CSS. No JavaScript animations. No animation libraries.
- **Subtle and functional**: Transitions serve as feedback for user actions (hover, focus, click). They are not decorative animations.
- **Performance**: Use only GPU-compositable properties where possible (`transform`, `opacity`). Avoid animating `width`, `height`, `margin`, or `padding`.
- **Accessibility**: Respect `prefers-reduced-motion`. All transitions and transforms are wrapped in a `@media (prefers-reduced-motion: no-preference)` block so users who prefer reduced motion see instant state changes (current behavior).
- **Consistent timing**: Use `0.2s` duration for color/opacity transitions and `0.15s` for transforms. Use `ease` timing function explicitly for all. The existing transitions in the codebase use `0.2s` without specifying a timing function (defaulting to `ease`), so the explicit `ease` matches existing behavior.
- **No animated platypus**: Per the existing web-pages spec, there must be no animated, moving, or swimming platypus element on any page. The mascot image may have a subtle hover scale effect but must not move, bounce, or swim.

## Changes to `public/styles.css`

All new transitions are added inside a `@media (prefers-reduced-motion: no-preference)` block at the end of the stylesheet.

### 1. Link Transitions

**All links (`a`)**: Add `transition: color 0.2s ease` so hover color changes are smooth rather than instant.

**Footer nav links (`.footer-nav a`)**: Add `transition: color 0.2s ease` for the hover color change. The `text-decoration: underline` on hover remains instant (underline transitions are not well-supported cross-browser).

**Hero title link (`.hero h1 a`)**: Add `transition: color 0.2s ease`.

### 2. Button Enhancements

**Submit button (`button[type="submit"]`)**: Already has `transition: background 0.2s`. Extend to include a subtle scale-down on `:active` state to provide click feedback:

```css
button[type="submit"]:active {
  transform: scale(0.97);
}
```

Add `transition: background 0.2s ease, transform 0.15s ease` to the base state.

**Unsubscribe button (`.unsubscribe-btn`)**: Same treatment as the submit button — add `:active` scale-down and extend the transition to include `transform`.

### 3. Form Input Focus

**Email input (`.email-input`)**: Already has `transition: border-color 0.2s`. Add a subtle box-shadow glow on focus to make the focused state more visible:

```css
.email-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(168, 101, 32, 0.15);
}
```

Extend the transition to include `box-shadow`: `transition: border-color 0.2s ease, box-shadow 0.2s ease`.

### 4. Form Message Appearance

**Form message (`#form-message`, `.form-message`)**: When the form message is revealed (by JavaScript removing the `hidden` attribute), it should fade in. Add a CSS animation:

```css
.form-message:not([hidden]) {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

This animation plays once when the message appears (success or error). The `hidden` attribute controls visibility — the animation triggers when `hidden` is removed by the existing JavaScript.

### 5. Content Card Hover (Optional, Subtle)

**Content cards (`.content-card`)**: Add a very subtle lift effect on hover, restricted to devices that support hover (not touch devices):

```css
@media (hover: hover) {
  .content-card {
    transition: box-shadow 0.2s ease;
  }
  .content-card:hover {
    box-shadow: 0 2px 12px rgba(61, 44, 30, 0.08);
  }
}
```

This applies to the content cards on the Inspiration and About pages. Keep it extremely subtle — the shadow should be barely perceptible, just enough to hint at interactivity. The `@media (hover: hover)` wrapper prevents sticky hover states on touch devices.

### 6. Mascot Image Hover

**Mascot image (`.mascot-image`)**: Add a subtle scale effect on hover:

```css
.mascot-image {
  transition: transform 0.2s ease;
}
.mascot-image:hover {
  transform: scale(1.03);
}
```

The scale is intentionally minimal (3%). The mascot must not bounce, rotate, wiggle, or animate continuously. It is a static image with a hover acknowledgment.

### 7. Focus-Visible Enhancements

**Email input and buttons**: Add a smooth `box-shadow` transition to the existing `:focus-visible` styles. The existing `outline`-based focus indicators remain unchanged outside the `prefers-reduced-motion` media query — they serve as the accessible baseline for users who prefer reduced motion. Inside the media query, enhance focus feedback with a transitioned box-shadow that appears alongside the outline:

```css
a:focus-visible,
button:focus-visible,
.email-input:focus-visible {
  box-shadow: 0 0 0 3px rgba(168, 101, 32, 0.2);
  transition: box-shadow 0.2s ease;
}
```

Do NOT remove `outline` — it remains as the primary focus indicator for accessibility. The box-shadow adds a subtle glow effect on top of the outline for users who have no motion preference.

## What NOT to Add

- **No page transitions**: No fade-in or slide-in effects when navigating between pages. This would require JavaScript (or View Transitions API which has limited support).
- **No loading skeletons**: The pages render server-side in full — there's no progressive loading to skeleton.
- **No scroll animations**: No elements that animate as they scroll into view. The pages are short and don't benefit from scroll-triggered effects.
- **No hover effects on fact images**: Fact images on the fact page are informational, not interactive. Adding hover effects would imply they're clickable.
- **No continuous animations**: Nothing that loops, pulses, or moves on its own. All interactions are user-triggered.

## Reduced Motion

The entire micro-interactions section is wrapped in:

```css
@media (prefers-reduced-motion: no-preference) {
  /* All transitions and animations here */
}
```

Users with `prefers-reduced-motion: reduce` see the current behavior: instant state changes with no transitions. The existing 3 transitions (email input border, submit button background, unsubscribe button background) should also be moved inside this media query for consistency.

## Testing

- Verify all transitions work in Chrome, Firefox, and Safari
- Verify `prefers-reduced-motion: reduce` disables all transitions (test in browser DevTools > Rendering > Emulate CSS media feature)
- Verify the form message fade-in works for both success and error states
- Verify button `:active` scale-down feels responsive (not laggy)
- Verify the mascot hover scale is subtle and does not cause layout shift
- Verify content card hover shadow is barely perceptible
- Verify focus-visible indicators are visible for keyboard navigation (outline must still be present — box-shadow is additive)
- Verify content card hover effect does NOT trigger on touch devices (test on mobile or with DevTools touch emulation)
- No new automated tests required (these are CSS-only visual changes)

## Rollback

To revert all micro-interactions, remove the `@media (prefers-reduced-motion: no-preference)` block from `public/styles.css` and restore the 3 original transitions to their unconditional locations. No application code changes are needed.
