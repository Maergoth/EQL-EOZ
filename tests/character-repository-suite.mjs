// Keep the Windows npm command below cmd.exe's command-line bound while running
// each repository regression in order. A rejected import stops the source gate.
for(const suite of [
    'inventory-stream-parser',
    'inventory-import-record',
    'inventory-legacy-migration',
    'character-repository-client',
    'character-repository-workspace',
    'character-repository',
    'character-repository-recovery',
    'character-storage-retirement'
])await import(`./${suite}.mjs`);
