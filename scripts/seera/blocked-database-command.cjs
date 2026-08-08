"use strict";

const command = process.argv[2] || "database command";
console.error(
  `[SEERA SAFETY] ${command} is disabled during Phase 1 Block 1. ` +
    "No database command is authorized until the clean Seera schema and identity guard pass review.",
);
process.exit(1);

