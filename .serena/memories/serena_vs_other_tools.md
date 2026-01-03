# When to Use Serena vs Other Tools

## Serena Tools (Semantic Code Operations)

### USE SERENA FOR:

#### 1. Understanding Code Structure
- `get_symbols_overview` - Get high-level view of a file's classes, functions, methods
- `find_symbol` - Find specific classes, functions, methods by name
- `find_referencing_symbols` - Find all references to a symbol across codebase

**Example**: "Where is ProjectService used?" → Use `find_referencing_symbols`

#### 2. Precise Code Edits
- `replace_symbol_body` - Replace an entire function/method/class
- `insert_after_symbol` - Add code after a symbol (new method, new function)
- `insert_before_symbol` - Add code before a symbol (imports, new class)
- `rename_symbol` - Rename across entire codebase safely

**Example**: "Add a new method to ProjectService" → Use `find_symbol` then `insert_after_symbol`

#### 3. Code Navigation & Discovery
- `search_for_pattern` - Regex search across files (more flexible than grep)
- `find_file` - Find files by name pattern
- `list_dir` - Explore directory structure

**Example**: "Find all TODO comments" → Use `search_for_pattern`

#### 4. Project Memory
- `write_memory`, `read_memory`, `list_memories` - Persist project knowledge

---

## Other Tools (Non-Semantic Operations)

### USE Read/Edit/Write FOR:
- Reading/writing non-code files (JSON, YAML, MD, config)
- Small line-based edits when you know exact line numbers
- Reading entire files when you need full context

### USE Glob FOR:
- Finding files by pattern when you need the paths only
- Quick file existence checks

### USE Grep FOR:
- Simple text search when you don't need symbol context
- Searching in non-code files

### USE Bash FOR:
- Running commands (build, test, lint, git)
- System operations
- Package management (pnpm)

### USE Task (Explore Agent) FOR:
- Open-ended codebase exploration
- Answering "how does X work?" questions
- Finding patterns across multiple files

---

## Decision Matrix

| Task | Best Tool |
|------|-----------|
| Find a class/function definition | `find_symbol` |
| See what methods a class has | `get_symbols_overview` |
| Find all usages of a function | `find_referencing_symbols` |
| Replace a function body | `replace_symbol_body` |
| Add a new method to a class | `insert_after_symbol` |
| Rename variable/function globally | `rename_symbol` |
| Read a config file | `Read` |
| Edit a JSON/YAML file | `Edit` |
| Find files by name | `Glob` or `find_file` |
| Search text in markdown | `Grep` |
| Run tests/build/lint | `Bash` |
| Explore "how does X work?" | `Task` (Explore agent) |
| Search for regex patterns | `search_for_pattern` |

---

## Efficiency Tips

1. **Start with `get_symbols_overview`** before reading full files
2. **Use `find_symbol` with `include_body=True`** to read just the code you need
3. **Use `depth` parameter** to control how much you retrieve
4. **Use `relative_path`** to restrict searches to specific directories
5. **Use memories** to avoid re-discovering project information
6. **Think tools** (`think_about_collected_information`, etc.) help verify approach

## Anti-Patterns to Avoid

❌ Reading entire files when you only need one function → Use `find_symbol`
❌ Using grep to find class definitions → Use `find_symbol`
❌ Manually editing to rename → Use `rename_symbol`
❌ Re-exploring the same things → Use/update memories
