## Summary
<!-- One paragraph. What does this change and why. -->

## Type of change
<!-- Keep the ones that apply -->
- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs
- [ ] Security fix (if so, follow SECURITY.md before opening publicly)
- [ ] Breaking API change (coordinate with maintainer)

## Test plan
<!-- How did you verify this? Paste the relevant command + output. -->
- [ ] `npm test` passes locally
- [ ] Added/updated tests for the change
- [ ] Updated `openapi/openapi.yaml` if the HTTP surface changed
- [ ] Checked UI changes in a browser (if applicable)

## Accessibility check (if touching UI or overlay)
- [ ] Keyboard reachable
- [ ] Focus visible
- [ ] Contrast ≥ 4.5:1 for text, 3:1 for UI
- [ ] Honors `prefers-reduced-motion`

## Security check (if touching auth, providers, or user input)
- [ ] User-supplied strings are escaped before reaching HTML/JSON-in-script contexts
- [ ] Outbound HTTP calls go through the provider interfaces
- [ ] New env vars documented in `.env.example`
