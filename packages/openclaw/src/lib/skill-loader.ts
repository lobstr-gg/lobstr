import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  path: string;
}

export function getSkillsDir(workspacePath: string): string {
  return path.join(workspacePath, 'skills');
}

export function listInstalledSkills(workspacePath: string): SkillManifest[] {
  const skillsDir = getSkillsDir(workspacePath);
  if (!fs.existsSync(skillsDir)) return [];

  const skills: SkillManifest[] = [];
  for (const dir of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, dir);
    if (!fs.statSync(skillPath).isDirectory()) continue;

    const pkgPath = path.join(skillPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      skills.push({
        name: pkg.name || dir,
        version: pkg.version || '0.0.0',
        description: pkg.description || '',
        path: skillPath,
      });
    } else {
      // Skill without package.json — check for SKILL.md
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        skills.push({
          name: dir,
          version: '0.0.0',
          description: '',
          path: skillPath,
        });
      }
    }
  }

  return skills;
}

export function loadSkillCommands(workspacePath: string, program: Command): void {
  const skills = listInstalledSkills(workspacePath);

  for (const skill of skills) {
    // Try loading from dist/index.js (compiled) or index.js
    const candidates = [
      path.join(skill.path, 'dist', 'index.js'),
      path.join(skill.path, 'index.js'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          const mod = require(candidate);
          if (typeof mod.registerCommands === 'function') {
            mod.registerCommands(program);
          }
        } catch (err) {
          // Silently skip broken skills
          console.error(`Warning: Failed to load skill "${skill.name}": ${(err as Error).message}`);
        }
        break;
      }
    }
  }
}
