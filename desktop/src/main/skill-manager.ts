import * as fs from 'fs';
import * as path from 'path';
import { getDataDir } from './utils/env';

// --------------- Types ---------------

export type SkillToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type Skill = {
  name: string;
  description: string;
  version?: string;
  author?: string;
  triggers: string[];
  tags: string[];
  tools: SkillToolDef[];
  /** Absolute path to the directory containing SKILL.md */
  basePath: string;
  /** Parsed SKILL.md body (Markdown instructions) */
  instructions: string;
  /** Whether a scripts/ subdirectory exists */
  hasScripts: boolean;
  /** Whether a references/ subdirectory exists */
  hasReferences: boolean;
  source: 'global' | 'project' | 'workspace';
};

export type SkillIndexEntry = {
  name: string;
  description: string;
  version?: string;
  author?: string;
  triggers: string[];
  tags: string[];
  source: 'global' | 'project' | 'workspace';
};

// --------------- Frontmatter Parser ---------------

/**
 * Minimal YAML frontmatter parser for SKILL.md.
 * Parses content between leading `---` delimiters.
 */
function parseFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const lines = content.split('\n');
  if (lines.length < 2 || lines[0].trim() !== '---') {
    return { meta: {}, body: content };
  }

  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) {
    return { meta: {}, body: content };
  }

  const meta: Record<string, unknown> = {};
  const metaLines = lines.slice(1, endIdx);

  for (const line of metaLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    let value: unknown = line.substring(colonIdx + 1).trim();

    // Handle arrays: `key:\n  - item1\n  - item2`
    if (value === '' || value === '[]') {
      const arrLines = metaLines.filter(
        (ml) => ml.trimStart().startsWith('- ') && ml.trimStart().indexOf('- ') === ml.indexOf('- ') - ml.indexOf(ml.trim()),
      );
      // We'll handle inline arrays via simple heuristics
      if (value === '[]') value = [];
    }

    // Simple value parsing
    if (typeof value === 'string') {
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (/^\d+$/.test(value)) value = parseInt(value, 10);
      else if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    }

    meta[key] = value;
  }

  // Handle multi-line arrays (tags, triggers, tools)
  for (const key of ['tags', 'triggers']) {
    const keyIdx = metaLines.findIndex(l => l.trim().startsWith(key + ':'));
    if (keyIdx === -1) continue;
    const values: string[] = [];
    for (let i = keyIdx + 1; i < metaLines.length; i++) {
      const trimmed = metaLines[i].trim();
      if (trimmed.startsWith('- ')) {
        values.push(trimmed.substring(2).trim());
      } else if (!trimmed.startsWith(' ')) {
        break;
      }
    }
    if (values.length > 0) meta[key] = values;
  }

  const body = lines.slice(endIdx + 1).join('\n').trim();
  return { meta, body };
}

/**
 * Normalize frontmatter value helpers.
 */
function arrayMeta(meta: Record<string, unknown>, key: string): string[] {
  const v = meta[key];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return [v];
  return [];
}

function stringMeta(meta: Record<string, unknown>, key: string, fallback = ''): string {
  const v = meta[key];
  return typeof v === 'string' ? v : fallback;
}

// --------------- SkillManager ---------------

export type SkillManagerOptions = {
  /** Additional scan paths (besides defaults) */
  extraScanPaths?: string[];
};

/**
 * Discovers and manages Skills — reusable instruction bundles
 * that extend the agent's capabilities.
 *
 * Scan priority (last wins on name conflict):
 * 1. ~/.codex/skills/  (global)
 * 2. <project>/.agents/skills/  (project)
 * 3. <workspace>/.skills/  (workspace)
 */
export class SkillManager {
  private defaultScanPaths: string[] = [
    path.join(process.env.HOME || '~', '.codex', 'skills'),
  ];

  private extraScanPaths: string[] = [];
  private cache: Map<string, Skill> = new Map();

  constructor(options?: SkillManagerOptions) {
    if (options?.extraScanPaths) {
      this.extraScanPaths = options.extraScanPaths;
    }
  }

  /**
   * Set project-level scan paths (called when workspace changes).
   */
  public setProjectScanPaths(projectPath?: string, workspacePath?: string): void {
    this.defaultScanPaths = [
      path.join(process.env.HOME || '~', '.codex', 'skills'),
    ];
    if (projectPath) {
      this.defaultScanPaths.push(path.join(projectPath, '.agents', 'skills'));
    }
    if (workspacePath) {
      this.defaultScanPaths.push(path.join(workspacePath, '.skills'));
    }
    // Clear cache so next discovery re-scans
    this.cache.clear();
  }

  /**
   * Full discovery: scan all paths, parse all SKILL.md files.
   */
  public discoverSkills(): Skill[] {
    const seen = new Map<string, Skill>();
    const scanned = new Set<string>();

    const allPaths = [...this.defaultScanPaths, ...this.extraScanPaths];

    for (const scanPath of allPaths) {
      if (scanned.has(scanPath)) continue;
      scanned.add(scanPath);

      if (!fs.existsSync(scanPath)) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(scanPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(scanPath, entry.name);
        const skillFile = path.join(skillDir, 'SKILL.md');

        if (!fs.existsSync(skillFile)) continue;

        const skill = this.parseSkillFile(skillFile, skillDir);
        if (skill) {
          // Later scan paths override earlier ones (per-source priority)
          seen.set(skill.name, skill);
        }
      }
    }

    // Determine source for each path
    const skills = Array.from(seen.values());
    for (const skill of skills) {
      if (skill.basePath.includes('.codex')) {
        skill.source = 'global';
      } else if (skill.basePath.includes('.agents')) {
        skill.source = 'project';
      } else {
        skill.source = 'workspace';
      }
    }

    this.cache.clear();
    for (const skill of skills) {
      this.cache.set(skill.name, skill);
    }

    return skills;
  }

  /**
   * Get a single skill by name.
   */
  public getSkill(name: string): Skill | undefined {
    if (this.cache.size === 0) {
      this.discoverSkills();
    }
    return this.cache.get(name);
  }

  /**
   * List all skills as lightweight index entries (no instructions).
   */
  public listSkills(): SkillIndexEntry[] {
    const skills = this.cache.size > 0
      ? Array.from(this.cache.values())
      : this.discoverSkills();

    return skills.map(s => ({
      name: s.name,
      description: s.description,
      version: s.version,
      author: s.author,
      triggers: s.triggers,
      tags: s.tags,
      source: s.source,
    }));
  }

  /**
   * Read the full SKILL.md content for a skill (instructions).
   */
  public readSkill(name: string): string | undefined {
    const skill = this.getSkill(name);
    return skill?.instructions;
  }

  /**
   * Get the tool definitions a skill registers.
   */
  public getSkillTools(name: string): SkillToolDef[] {
    const skill = this.getSkill(name);
    return skill?.tools ?? [];
  }

  /**
   * Get all tool definitions from all installed skills.
   */
  public getAllSkillTools(): Map<string, SkillToolDef[]> {
    const result = new Map<string, SkillToolDef[]>();
    const skills = this.cache.size > 0
      ? Array.from(this.cache.values())
      : this.discoverSkills();

    for (const skill of skills) {
      if (skill.tools.length > 0) {
        result.set(skill.name, skill.tools);
      }
    }
    return result;
  }

  /**
   * Install a skill from a source directory by copying it.
   */
  public installSkill(sourcePath: string, targetName?: string): Skill | null {
    const sourceSkillFile = path.join(sourcePath, 'SKILL.md');
    if (!fs.existsSync(sourceSkillFile)) return null;

    const name = targetName || path.basename(sourcePath);
    const targetDir = path.join(this.defaultScanPaths[0], name);

    // Copy recursively
    this.copyRecursive(sourcePath, targetDir);

    // Parse and cache
    const skill = this.parseSkillFile(path.join(targetDir, 'SKILL.md'), targetDir);
    if (skill) {
      skill.source = 'global';
      this.cache.set(skill.name, skill);
    }
    return skill ?? null;
  }

  /**
   * Clear the internal cache (forces re-discovery on next access).
   */
  public refresh(): void {
    this.cache.clear();
  }

  // ---- Private ----

  private parseSkillFile(skillFile: string, skillDir: string): Skill | null {
    try {
      const content = fs.readFileSync(skillFile, 'utf8');
      const { meta, body } = parseFrontmatter(content);

      if (!meta.name) return null; // SKILL.md must have a name

      const name = stringMeta(meta, 'name');
      const description = stringMeta(meta, 'description', name);

      // Parse tools from frontmatter (optional)
      const tools: SkillToolDef[] = [];
      const toolsRaw = meta.tools;
      if (Array.isArray(toolsRaw)) {
        for (const t of toolsRaw) {
          if (typeof t === 'object' && t !== null && (t as any).name) {
            const tt = t as Record<string, unknown>;
            tools.push({
              name: String(tt.name),
              description: String(tt.description || ''),
              input_schema: (tt.input_schema as Record<string, unknown>) || {},
            });
          }
        }
      }

      return {
        name,
        description,
        version: stringMeta(meta, 'version'),
        author: stringMeta(meta, 'author'),
        triggers: arrayMeta(meta, 'triggers'),
        tags: arrayMeta(meta, 'tags'),
        tools,
        basePath: skillDir,
        instructions: body,
        hasScripts: fs.existsSync(path.join(skillDir, 'scripts')),
        hasReferences: fs.existsSync(path.join(skillDir, 'references')),
        source: 'global', // caller should fix this
      };
    } catch {
      return null;
    }
  }

  private copyRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
