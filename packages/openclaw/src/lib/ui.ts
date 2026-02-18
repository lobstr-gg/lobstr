import chalk from 'chalk';
import ora from 'ora';

export function success(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function spinner(text: string) {
  return ora({ text, color: 'cyan' }).start();
}

export function table(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
    return Math.max(h.length, maxData) + 2;
  });

  const headerLine = headers.map((h, i) => chalk.bold(h.padEnd(colWidths[i]))).join('');
  const separator = colWidths.map(w => '─'.repeat(w)).join('');

  console.log(headerLine);
  console.log(chalk.dim(separator));
  for (const row of rows) {
    console.log(row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(''));
  }
}

export function header(text: string): void {
  console.log();
  console.log(chalk.bold.cyan(text));
  console.log(chalk.dim('─'.repeat(text.length)));
}
