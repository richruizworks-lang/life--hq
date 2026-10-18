import fs from "fs";

const file = "app/page.js";
let src = fs.readFileSync(file, "utf8");

if (!src.includes('"use client"') && !src.includes("'use client'")) {
  console.log("ERROR: app/page.js is not a client component. Stopping.");
  process.exit(1);
}

if (!/useState\s*\(/.test(src)) {
  console.log("ERROR: Could not find useState in app/page.js. Stopping.");
  process.exit(1);
}

// Ensure useEffect is imported
src = src.replace(
  /import\s+React\s*,\s*\{([^}]*)\}\s+from\s+["']react["'];?/,
  (m, inner) => {
    const parts = inner.split(",").map(s => s.trim()).filter(Boolean);
    if (!parts.includes("useEffect")) parts.unshift("useEffect");
    const uniq = [...new Set(parts)];
    return `import React, { ${uniq.join(", ")} } from "react";`;
  }
);

// If import was default only: import React from "react";
src = src.replace(
  /import\s+React\s+from\s+["']react["'];?/,
  `import React, { useEffect } from "react";`
);

// Add storage helpers once
if (!src.includes("const STORAGE_KEY = \"lifehq:tasks:v1\";")) {
  const insertAfterImports = src.search(/\n\s*(function\s+\w+\s*\(|export\s+default\s+function\s+\w+\s*\()/);
  if (insertAfterImports !== -1) {
    const helper = `

const STORAGE_KEY = "lifehq:tasks:v1";

function safeLoadTasks() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
`;
    src = src.slice(0, insertAfterImports) + helper + src.slice(insertAfterImports);
  }
}

// Replace task state initializer (entries/tasks/items)
src = src.replace(
  /const\s+\[\s*(entries|tasks|items)\s*,\s*set(Entries|Tasks|Items)\s*\]\s*=\s*useState\s*\(\s*\[\s*\]\s*\)\s*;/,
  `const [$1, set$2] = useState(() => safeLoadTasks());`
);

// Inject persistence effect before first return inside component
if (!src.includes("window.localStorage.setItem(STORAGE_KEY")) {
  src = src.replace(
    /(\n\s*return\s*\()/,
    `
  useEffect(() => {
    try {
      const data = typeof entries !== "undefined"
        ? entries
        : (typeof tasks !== "undefined" ? tasks : (typeof items !== "undefined" ? items : []));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [typeof entries !== "undefined" ? entries : (typeof tasks !== "undefined" ? tasks : items)]);

$1`
  );
}

fs.writeFileSync(file, src, "utf8");
console.log("Patched app/page.js with local persistence.");
