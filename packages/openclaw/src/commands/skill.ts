import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspace } from '../lib/workspace';
import { listInstalledSkills, getSkillsDir } from '../lib/skill-loader';
import * as ui from '../lib/ui';

export function registerSkillCommand(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage workspace skills');

  skill
    .command('add <name>')
    .description('Add a skill to the workspace')
    .option('--from <path>', 'Install from local path')
    .action((name: string, opts: { from?: string }) => {
      try {
        const ws = ensureWorkspace();
        const skillsDir = getSkillsDir(ws.path);
        const targetDir = path.join(skillsDir, name);

        if (fs.existsSync(targetDir)) {
          ui.error(`Skill "${name}" is already installed`);
          process.exit(1);
        }

        if (opts.from) {
          // Copy from local path
          const srcPath = path.resolve(opts.from);
          if (!fs.existsSync(srcPath)) {
            ui.error(`Source path not found: ${srcPath}`);
            process.exit(1);
          }
          copyDirSync(srcPath, targetDir);
          ui.success(`Skill "${name}" installed from ${srcPath}`);
        } else {
          // Create placeholder directory for the skill
          fs.mkdirSync(targetDir, { recursive: true });

          // Try to resolve from node_modules (workspace dependency)
          try {
            const pkgName = name === 'lobstr' ? 'openclaw-skill' : `openclaw-skill-${name}`;
            const resolved = require.resolve(`${pkgName}/package.json`, { paths: [process.cwd()] });
            const pkgDir = path.dirname(resolved);
            copyDirSync(pkgDir, targetDir);
            ui.success(`Skill "${name}" installed from ${pkgName}`);
          } catch {
            ui.success(`Skill "${name}" directory created at ${targetDir}`);
            ui.info('Copy your skill files (SKILL.md, dist/) into this directory');
          }
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  skill
    .command('list')
    .description('List installed skills')
    .action(() => {
      try {
        const ws = ensureWorkspace();
        const skills = listInstalledSkills(ws.path);

        if (skills.length === 0) {
          ui.info('No skills installed. Run: openclaw skill add <name>');
          return;
        }

        ui.header('Installed Skills');
        ui.table(
          ['Name', 'Version', 'Description'],
          skills.map(s => [s.name, s.version, s.description])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  skill
    .command('remove <name>')
    .description('Remove a skill from the workspace')
    .action((name: string) => {
      try {
        const ws = ensureWorkspace();
        const targetDir = path.join(getSkillsDir(ws.path), name);

        if (!fs.existsSync(targetDir)) {
          ui.error(`Skill "${name}" is not installed`);
          process.exit(1);
        }

        fs.rmSync(targetDir, { recursive: true, force: true });
        ui.success(`Skill "${name}" removed`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
