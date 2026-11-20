export interface ProcessMemory {
  pid: number;
  parent: number;
  rssBytes: number;
  command: string;
}

/** ps reports RSS in KiB on the macOS/Linux profiles supported by this runner. */
export function processTreeMemory(table: string, rootPid: number) {
  const rows: ProcessMemory[] = table
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (!match) throw new Error('Unsupported ps memory table.');
      return {
        pid: Number(match[1]),
        parent: Number(match[2]),
        rssBytes: Number(match[3]) * 1024,
        command: match[4]!,
      };
    });
  if (!rows.some((row) => row.pid === rootPid)) throw new Error('Browser process has exited.');
  const owned = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (owned.has(row.parent) && !owned.has(row.pid)) {
        owned.add(row.pid);
        changed = true;
      }
    }
  }
  const processes = rows.filter((row) => owned.has(row.pid));
  return {
    // Shared pages can be counted more than once; this is not total private memory.
    rssBytes: processes.reduce((sum, row) => sum + row.rssBytes, 0),
    processes,
  };
}
