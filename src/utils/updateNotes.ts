interface ReleaseNotesResult {
  version: string;
  body: string;
}

const DEFAULT_NOTE = 'Includes the latest features and bug fixes.';

/** Strip everything after the first horizontal rule, keeping only the changelog */
export function extractChangelog(body: string | null): string {
  if (!body) return '';
  const cutoff = body.search(/^---+$/m);
  const section = cutoff > 0 ? body.slice(0, cutoff) : body;
  return section.trim();
}

/**
 * Extract the changelog section for a specific version from a markdown changelog.
 *
 * Format expected:
 *   # Changelog
 *   ## v1.2.3
 *   ...content...
 *   ## v1.2.2
 *   ...content...
 *
 * - Finds the `## v{version}` heading (version with or without `v` prefix)
 * - Captures all lines until the next `## ` heading
 * - Falls back to the first section if the version is not found
 * - Falls back to a default message if the changelog is empty
 */
export function getLocalReleaseNotes(changelogRaw: string, version: string): ReleaseNotesResult {
  const cleanVersion = version.replace(/^v/, '');
  const body = extractVersionSection(changelogRaw, cleanVersion) || extractFirstSection(changelogRaw);
  return {
    version: cleanVersion,
    body: body || DEFAULT_NOTE,
  };
}

function extractVersionSection(md: string, version: string): string {
  const lines = md.split('\n');
  const target = `## v${version}`;
  const altTarget = `## ${version}`;

  let capturing = false;
  let found = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (capturing) {
        break;
      }
      if (line.trim() === target || line.trim() === altTarget) {
        capturing = true;
        found = true;
      }
    } else if (capturing) {
      captured.push(line);
    }
  }

  return found ? captured.join('\n').trim() : '';
}

function extractFirstSection(md: string): string {
  const lines = md.split('\n');
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (capturing) {
        break;
      }
      capturing = true;
      continue;
    }
    if (capturing) {
      captured.push(line);
    }
  }

  return captured.join('\n').trim();
}
