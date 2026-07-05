```markdown
# peerlab Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `peerlab` JavaScript repository. It covers file naming, import/export styles, commit message habits, and testing approaches. While no specific framework is detected, the repository follows clear conventions for organizing code and tests, making it easy to maintain and extend.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.js`, `dataFetcher.js`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```javascript
    import { fetchData } from './dataFetcher';
    ```

### Export Style
- Use **named exports** for functions, objects, or classes.
  - Example:
    ```javascript
    // In dataFetcher.js
    export function fetchData(url) { ... }
    ```

### Commit Messages
- Freeform style, no enforced prefixes.
- Average length: ~68 characters.
- Example:
  ```
  Add support for fetching user data from API
  ```

## Workflows

### Adding a New Module
**Trigger:** When you need to add a new feature or utility.
**Command:** `/add-module`

1. Create a new file using camelCase (e.g., `newFeature.js`).
2. Implement your logic using named exports.
    ```javascript
    export function newFeature() { ... }
    ```
3. Import your module where needed using a relative path.
    ```javascript
    import { newFeature } from './newFeature';
    ```
4. Write a corresponding test file (see Testing Patterns).

### Writing Tests
**Trigger:** When you add or modify functionality.
**Command:** `/write-test`

1. Create a test file with the pattern `*.test.*` (e.g., `newFeature.test.js`).
2. Write your tests using the project's preferred (but unspecified) testing framework.
    ```javascript
    // Example structure
    import { newFeature } from './newFeature';

    test('newFeature works as expected', () => {
      // assertions here
    });
    ```
3. Run your tests using the project's test runner.

### Committing Changes
**Trigger:** When you are ready to save your work.
**Command:** `/commit-changes`

1. Write a clear, concise commit message (freeform, ~68 chars).
    ```
    Fix bug in user authentication flow
    ```
2. Commit your changes.

## Testing Patterns

- Test files follow the `*.test.*` pattern (e.g., `userProfile.test.js`).
- The specific testing framework is not detected; use standard JavaScript testing practices.
- Place tests alongside or near the modules they test.

## Commands
| Command         | Purpose                                      |
|-----------------|----------------------------------------------|
| /add-module     | Scaffold a new module with conventions       |
| /write-test     | Create a test file for a module              |
| /commit-changes | Commit changes with a clear message          |
```
