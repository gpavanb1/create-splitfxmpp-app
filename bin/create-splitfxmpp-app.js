#!/usr/bin/env node
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { pascalCase, snakeCase } from 'change-case';
import { execa } from 'execa';

const TEMPLATE_REPO = 'https://github.com/gpavanb1/AppFXMpp.git';

async function main() {
  const rawArg = process.argv[2];
  let appName = rawArg;

  if (!appName) {
    const response = await inquirer.prompt({
      name: 'appName',
      message: 'Your app name (PascalCase, e.g. MyCoolApp):'
    });
    appName = response.appName;
  }

  function isPascalCase(str) {
    // starts with uppercase, then only letters/numbers
    return /^[A-Z][A-Za-z0-9]*$/.test(str);
  }

  let pascal;
  if (isPascalCase(appName)) {
    pascal = appName; // keep exactly what user typed
  } else {
    pascal = pascalCase(appName); // normalize messy input
  }

  const snake = snakeCase(appName);
  const target = path.resolve(process.cwd(), pascal);

  if (fs.existsSync(target)) {
    console.error(chalk.red(`❌ Folder '${pascal}' already exists`));
    process.exit(1);
  }

  console.log(chalk.blue('📦 Cloning template via git...'));
  await execa('git', ['clone', '--depth=1', TEMPLATE_REPO, target], { stdio: 'inherit' });
  await fs.remove(path.join(target, '.git'));

  // Rename app include folder
  console.log(chalk.blue('🔧 Renaming app include folder...'));
  const oldAppPath = path.join(target, 'include', 'app');
  const newAppPath = path.join(target, 'include', snake);
  await fs.move(oldAppPath, newAppPath);

  // Rename test file(s)
  console.log(chalk.blue('🔧 Renaming test files...'));
  const testsDir = path.join(target, 'tests');
  const testFiles = await fs.readdir(testsDir);
  for (const file of testFiles) {
    if (file.includes('test_app')) {
      const oldPath = path.join(testsDir, file);
      const newFile = file.replace(/test_app/, `test_${snake}`);
      const newPath = path.join(testsDir, newFile);
      await fs.move(oldPath, newPath);
    }
  }

  // Replace symbols in all files
  console.log(chalk.blue('🔧 Rewriting symbols...'));
  const replacements = {
    AppModel: `${pascal}Model`,
    AppEquation: `${pascal}Equation`,
    AppEquationTest: `${pascal}EquationTest`,
    'app.model': `${snake}.model`,
    'app.equation': `${snake}.equation`,
    'app/': `${snake}/`,
    'app.': `${snake}.`,
    'App': pascal,
    'app': snake, // must be last
  };

  await traverseAndReplace(target, replacements);

  console.log(chalk.green('\n✅ Your app scaffold is ready!'));
  console.log(`\n  cd ${pascal}`);
  console.log(chalk.gray('Initialize git, install deps, and start building!'));
}

async function traverseAndReplace(dir, replacements) {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await traverseAndReplace(filePath, replacements);
    } else {
      let content = await fs.readFile(filePath, 'utf8');
      for (const [from, to] of Object.entries(replacements)) {
        const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        content = content.replace(pattern, to);
      }
      await fs.writeFile(filePath, content);
    }
  }
}

main().catch(err => {
  console.error(chalk.red(`❌ ${err.message}`));
  process.exit(1);
});
