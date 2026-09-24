# Frontend Review

Use this reference when reviewing frontend files.

## Scope

Frontend files must be reviewed using their actual extension and contents rather than assuming that every file inside a frontend directory is frontend logic.

Review relevant:
- React components
- Next.js components/pages
- Client-side JavaScript/TypeScript
- Forms
- UI state and interaction logic
- Styling where it affects behavior, accessibility, or correctness
- API consumption from the client

## Functional Review

Check for:

- Incorrect UI state transitions
- Broken loading/error/success states
- Incorrect conditional rendering
- State synchronization problems
- Race conditions in client-side requests
- Missing cleanup for subscriptions/listeners/timers
- Incorrect event handling
- Incorrect form submission behavior
- Duplicate submissions
- Missing disabled/loading states
- Incorrect API request/response assumptions
- Unsafe client-side assumptions about backend data
- Broken navigation
- Incorrect URL/query parameter handling

Do not report a functional issue unless the reviewed code provides evidence for it.

## React / Next.js Review

Check for:

- Incorrect use of `useState`
- Incorrect use of `useEffect`
- Missing or incorrect dependencies
- Effects that create unnecessary repeated work
- State that can become stale
- Unnecessary client components
- Incorrect server/client boundary usage
- Incorrect async behavior
- Missing cleanup
- Unstable list keys
- Incorrect component composition
- Duplicate data fetching
- Unnecessary rendering or expensive calculations

Only report these when they create a concrete correctness, performance, maintainability, or architectural problem.

## Accessibility

Every frontend file must explicitly be checked for accessibility.

Check:

### Keyboard Operability
- Interactive elements must be keyboard accessible.
- Custom controls must support expected keyboard interaction.
- Focus must not become trapped or lost unexpectedly.
- Interactive elements must have visible focus.

### Semantic HTML
- Prefer native semantic elements where appropriate.
- Buttons should be buttons.
- Links should be links.
- Form controls should use appropriate native elements.

### Screen Readers
Check for:
- Missing accessible names
- Incorrect ARIA usage
- Missing labels
- Incorrect roles
- Hidden content that remains exposed to assistive technology
- Dynamic content that is not communicated appropriately

### Forms
Check:
- Inputs have associated labels or another valid accessible name.
- Error messages are associated with the relevant controls.
- Required fields are communicated appropriately.
- Form validation is understandable to assistive technology.

### Focus Management
Check:
- Modals/dialogs
- Menus
- Drawers
- Dynamic navigation
- Route transitions where relevant
- Newly inserted interactive content

### Contrast
Check for obvious insufficient text/control contrast when the relevant styles are available.

### Semantic Structure
Check:
- Heading hierarchy
- Landmarks
- Lists
- Tables
- Button/link semantics
- Appropriate ARIA only where needed

Accessibility findings must use the exact category:

`Accessibility`

Do not classify accessibility issues as generic frontend or correctness findings.

## UX

Check for concrete usability problems involving:

- Missing feedback
- Unclear error states
- Broken empty states
- Confusing interaction behavior
- Missing confirmation for destructive actions
- Inconsistent form behavior
- Unusable loading states

Do not treat subjective design preferences as defects.

## Performance

Check for concrete frontend performance problems such as:

- Unnecessary repeated API requests
- Expensive operations during rendering
- Excessive re-renders caused by implementation choices
- Large unnecessary client-side work
- Missing pagination or uncontrolled rendering where clearly required
- Unnecessary client-side processing

Do not report generic "performance could be improved" suggestions without evidence.