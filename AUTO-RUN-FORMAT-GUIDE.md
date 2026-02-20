# Auto Run Document Format Guide

## Core Principle
An **Auto Run Document** is a Markdown file with **executable tasks for AI agents**. Each task is ONE checkbox item (`- [ ]`), not multiple checkboxes grouped under a section heading.

---

## Correct Structure

### ✅ CORRECT Format

```markdown
- [ ] ## Task 1: Do something specific

Description of what the agent should do. Include clear instructions and context.

Some code example or details here.

---

- [ ] ## Task 2: Do another thing

Another task description with clear steps.

---

- [ ] ## Task 3: Verification steps

Verify that everything works:

- Verification point 1
- Verification point 2
- Verification point 3
```

**Key Points:**
1. **Each `- [ ]` is ONE executable task** - the checkbox marks the entire task
2. **Task heading is `- [ ] ## Task Name:`** - checkbox + heading together
3. **No nested checkboxes** - verification items are plain bullets (`-`), not checkboxes (`- [ ]`)
4. **Verification is ONE task** - all verification items are bullet points under ONE final `- [ ] ## Verification` task
5. **Tasks are separated by `---`** - clear visual separation between tasks

### ❌ INCORRECT Formats

**Wrong 1: Section headings without checkboxes (not executable)**
```markdown
## Fix 1: Do something

Task description...

- [ ] Item 1
- [ ] Item 2
```
❌ This won't work - the fixes aren't marked as tasks

**Wrong 2: Multiple checkboxes in verification section**
```markdown
- [ ] ## Task 1

Description...

## Verification Checklist

- [ ] Check item 1
- [ ] Check item 2
- [ ] Check item 3
```
❌ This creates 3 separate tasks instead of verification items

**Wrong 3: Verification items as nested checkboxes**
```markdown
- [ ] ## Verification

  - [ ] Item 1
  - [ ] Item 2
  - [ ] Item 3
```
❌ This creates sub-tasks, not verification points

---

## Structure Template

```markdown
# Document Title

**Objective:** What this Auto Run accomplishes

**Problem:** Why this is needed

---

- [ ] ## Fix 1: Clear description of first fix

Task description explaining what to do.

**Example or context:**
```
code here
```

Clear instructions on how to execute.

---

- [ ] ## Fix 2: Clear description of second fix

Task description.

---

- [ ] ## Fix 3: Another fix if needed

Task description.

---

- [ ] ## Verification Checklist

Verify all tasks completed successfully:

- Verification point 1
- Verification point 2
- Verification point 3
- All previous fixes verified
```

---

## Real Example (PR #18 Format)

```markdown
# PR #18 Option A: Simplify Migration Strategy

**Objective:** Fix Railway deployment...

---

- [ ] ## Fix 1: Update package.json start script

Replace the old command with the new one...

Read the file, make the change, verify.

---

- [ ] ## Fix 2: Delete handle-migration-safety.js

Remove the file...

---

- [ ] ## Fix 3: Commit changes

Commit with message...

---

- [ ] ## Verification Checklist

Verify all changes are correct:

- File X was modified correctly
- File Y was deleted
- Commit created with correct message
- Git status is clean
```

---

## Rules to Remember

1. **ONE checkbox per task** - `- [ ]` marks one complete unit of work
2. **NO nested checkboxes** - verification items are plain bullets
3. **NO section headings as tasks** - use `- [ ] ## Heading` format
4. **Separate with `---`** - visual clarity between tasks
5. **Verification is ONE task** - with multiple bullet points underneath
6. **Machine-executable only** - no human approval steps with checkboxes
7. **Plain bullets for verification** - use `-` not `- [ ]` for verification items

---

## When to Use Auto Run Documents

✅ **Use when:**
- You have multiple related code changes (3+ tasks)
- Tasks are independent or sequential
- All work is machine-executable
- You want agents to track progress per task

❌ **Don't use when:**
- Task is trivial (1-2 steps)
- Requires human approval/review
- Human manual testing needed
- Visual verification by human required

---

## Reference: PR #18 Actual Document

File: `/home/chris/code/RaidPresence/Auto Run Docs/PR18-01-SIMPLIFY-MIGRATION-STRATEGY.md`

This is the CORRECT format - use it as a template for all future Auto Run documents.
