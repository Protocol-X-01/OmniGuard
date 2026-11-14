# Compiler facts milestone

Freeze the challenge labels before implementation. First measure the parser-only baseline on the supplied imported-interface, overload, imported-struct and inherited-storage cases. These become development cases once used to implement fixes; they cannot serve as an independent held-out benchmark.

Add optional native-solc analysis through its Standard JSON interface. Pass the exact selected source snapshot, request AST only, disable the filesystem import callback and turn compiler errors into incomplete analysis. Do not download a compiler, resolve paths outside the selection or fall back silently when the requested compiler fails. Imports must resolve among supplied relative source keys.

Index compiler node IDs, referenced declarations, exact byte spans, expression types and state-variable flags. Use those facts in the existing Rust AST rules to resolve imported/overloaded boolean-returning methods, imported dynamic struct fields and inherited storage writes without confusing local shadows. The first compiler mode still uses bounded local guards/ordering/value-flow rules; it is not whole-program vulnerability proof.

Reports and bundles must identify the analysis mode and compiler version. Parser-only and compiler-assisted rescans must use distinct review baselines, even with the same rule IDs. Related declaration evidence may cross files and must carry its own source digest. Preserve old reports/profile hashes and retain the existing Jira history.

Validation includes actual solc runs on the frozen challenges, previous corpus regressions, errors with success process exit, missing imports with callback disabled, source/related-evidence tampering and report/profile isolation. Document remaining gaps and reproducible commands before deployment.
