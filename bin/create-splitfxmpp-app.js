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

  const baseName = appName.replace(/FXMpp$/i, '');
  const basePascal = isPascalCase(baseName) ? baseName : pascalCase(baseName);
  const baseSnake = snakeCase(baseName);

  const fullPascal = appName.toLowerCase().endsWith('fxmpp')
    ? (isPascalCase(appName) ? appName : pascalCase(appName))
    : `${basePascal}FXMpp`;

  const fullSnake = `${baseSnake}fxm`;

  const target = path.resolve(process.cwd(), fullPascal);

  if (fs.existsSync(target)) {
    console.error(chalk.red(`❌ Folder '${fullPascal}' already exists`));
    process.exit(1);
  }

  console.log(chalk.blue('📦 Cloning template via git...'));
  await execa('git', ['clone', '--depth=1', TEMPLATE_REPO, target], { stdio: 'inherit' });
  await fs.remove(path.join(target, '.git'));

  // Rename app include folder
  console.log(chalk.blue('🔧 Renaming app include folder...'));
  const oldAppPath = path.join(target, 'include', 'app');
  const newAppPath = path.join(target, 'include', fullSnake);
  await fs.move(oldAppPath, newAppPath);

  // Rename test file(s)
  console.log(chalk.blue('🔧 Renaming test files...'));
  const testsDir = path.join(target, 'tests');
  if (fs.existsSync(testsDir)) {
    const testFiles = await fs.readdir(testsDir);
    for (const file of testFiles) {
      if (file.includes('test_app')) {
        const oldPath = path.join(testsDir, file);
        const newFile = file.replace(/test_app/, `test_${fullSnake}`);
        const newPath = path.join(testsDir, newFile);
        await fs.move(oldPath, newPath);
      }
    }
  }

  // Replace symbols in all files
  console.log(chalk.blue('🔧 Rewriting symbols...'));
  
  const replacements = {
    'AppFXMpp': fullPascal,
    'appfxm': fullSnake,
    'AppModel': `${fullPascal}Model`,
    'AppEquation': `${fullPascal}Equation`,
    'AppEquationTest': `${fullPascal}EquationTest`,
    'app.model': `${fullSnake}.model`,
    'app.equation': `${fullSnake}.equation`,
    'app/': `${fullSnake}/`,
    'app.': `${fullSnake}.`,
    'App': fullPascal,
    'app': fullSnake, // must be last
  };

  await traverseAndReplace(target, replacements);

  console.log(chalk.green('\n✅ Your app scaffold is ready!'));
  console.log(`\n  cd ${fullPascal}`);
  console.log(chalk.gray('Initialize git, install deps, and start building!'));
}

async function traverseAndReplace(dir, replacements) {
  const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await traverseAndReplace(filePath, replacements);
    } else {
      let content = await fs.readFile(filePath, 'utf8');
      content = content.replace(pattern, (matched) => replacements[matched]);
      await fs.writeFile(filePath, content);
    }
  }
}

main().catch(err => {
  console.error(chalk.red(`❌ ${err.message}`));
  process.exit(1);
});
