# RenderShield React - Demo & Verification

This document provides demo code to verify Todos #4-6: Enhanced diagnostics with recommendations, component contract definition, and improved console output formatting.

## Demo Snippet

Copy this into a React component to see the new features in action:

```tsx
import React, { useState, useEffect } from "react";
import { useRenderShield } from "@lownoise-studio/render-shield-react";

function DemoComponent() {
  const [user, setUser] = useState({
    id: 1,
    name: "Alice",
    lastActive: Date.now(),
    metadata: { status: "active" },
  });

  // Simulate frequent updates to non-watched keys
  useEffect(() => {
    const interval = setInterval(() => {
      setUser((prev) => ({
        ...prev,
        lastActive: Date.now(), // Changes frequently but not watched
        metadata: { ...prev.metadata, status: "active" }, // Also changes
      }));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Use RenderShield with watch paths and contract
  const shieldedProps = useRenderShield(
    { user },
    {
      watch: ["user.id"], // Only watch user.id
      debug: true,
      componentName: "DemoComponent",
      contract: {
        watch: ["user.id"],
        description: "This component only cares about user ID",
      },
    }
  );

  return (
    <div>
      <h2>User ID: {shieldedProps.user.id}</h2>
      <p>Last Active: {new Date(user.lastActive).toLocaleTimeString()}</p>
      <p>Name: {user.name}</p>
    </div>
  );
}

export default DemoComponent;
```

## What to Expect

### 1. Recommendations (after 3+ renders)

After the component renders 3+ times with `lastActive` or `metadata` changing while `user.id` stays stable, you should see:

```
💡 Recommendations
  • Consider watching: lastActive, metadata
```

This appears because:
- `user.id` is watched and stable
- `lastActive` and `metadata` change frequently (>= 3 times)
- They are not in the watch list

### 2. Contract Compliance

You should see contract status in the console:

```
Contract: ✓ Compliant (specifies: [user.id])
Contract description: This component only cares about user ID
```

Or if contract drift occurs:

```
Contract: ⚠ Drift (specifies: [user.id])
```

### 3. Summary Statistics

Each report includes a summary line:

```
Summary: Shielded: Yes, Changed keys: 2, Stable keys: 1, Recommendations: 1
```

## Manual Verification Checklist

### Setup
- [ ] Create a React app with the demo component above
- [ ] Install RenderShield: `npm install @lownoise-studio/render-shield-react`
- [ ] Set `NODE_ENV=development` (or ensure not production)
- [ ] Open browser DevTools console

### Test 1: Recommendations Generation
- [ ] Render component with `watch: ["user.id"]` and `debug: true`
- [ ] Trigger 3+ renders where `user.id` stays same but other keys change
- [ ] Verify console shows "💡 Recommendations" section
- [ ] Verify recommendation suggests top 3 most repeated non-watched keys
- [ ] Verify recommendation only appears after >= 3 occurrences

### Test 2: Contract Compliance
- [ ] Add `contract: { watch: ["user.id"], description: "..." }` to options
- [ ] Render with watched keys matching contract
- [ ] Verify console shows "Contract: ✓ Compliant"
- [ ] Change a key not in contract watch list
- [ ] Verify console shows "Contract: ⚠ Drift"
- [ ] Verify contract description appears when provided

### Test 3: Summary Formatting
- [ ] Enable `debug: true`
- [ ] Trigger renders and check console
- [ ] Verify each report includes "Summary:" line
- [ ] Verify summary shows: Shielded status, Changed keys count, Stable keys count
- [ ] Verify recommendations count appears when recommendations exist

### Test 4: Low-Noise Recommendations
- [ ] Render component 2 times with same pattern
- [ ] Verify NO recommendations appear (threshold is 3)
- [ ] Render 3rd time with same pattern
- [ ] Verify recommendations appear
- [ ] Verify only top 3 most repeated keys are suggested

### Test 5: Contract Pass-Through (Hook)
- [ ] Use `useRenderShield` with `contract` option
- [ ] Verify contract appears in console logs
- [ ] Verify contract doesn't affect comparison logic (only documentation)

### Test 6: Contract Pass-Through (HOC)
- [ ] Use `withRenderShield` with `contract` option
- [ ] Verify contract appears in console logs
- [ ] Verify contract doesn't affect memo comparison logic

### Test 7: Backward Compatibility
- [ ] Use hook/HOC without `contract` option
- [ ] Verify no errors occur
- [ ] Verify existing behavior unchanged
- [ ] Verify no recommendations appear when history < 3 renders

## Expected Console Output Example

```
[RenderShield] <DemoComponent>
  Shielded: true
  Render count: 5
  Changed: ["lastActive", "metadata"]
  Stable: ["id"]
  Watched changed: []
  Watched stable: ["user.id"]
  Severity: Changed (non-UI key)
  Contract: ✓ Compliant (specifies: [user.id])
  Contract description: This component only cares about user ID
  💡 Recommendations
    • Consider watching: lastActive, metadata
  Summary: Shielded: Yes, Changed keys: 2, Stable keys: 1, Recommendations: 1
```

## Troubleshooting

- **No recommendations appearing**: Ensure at least 3 renders with the same pattern
- **Contract not showing**: Verify `contract` option is passed and `debug: true`
- **Summary not appearing**: Check that `debug: true` is enabled
- **Production mode**: Recommendations and history tracking are disabled in production builds
