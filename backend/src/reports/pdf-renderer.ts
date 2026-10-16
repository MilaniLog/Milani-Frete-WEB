import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : '',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (executable) return executable;

  try {
    const chromium = await import('@sparticuz/chromium');
    return await chromium.default.executablePath();
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(
      `Nenhum navegador compativel foi encontrado para gerar o PDF.${detail}`,
    );
  }
}

export async function renderHtmlPdf(html: string) {
  const dir = await mkdtemp(join(tmpdir(), 'frete-pdf-'));
  const input = join(dir, 'relatorio.html');
  const output = join(dir, 'relatorio.pdf');
  try {
    await writeFile(input, html, 'utf8');
    await execFileAsync(
      await chromePath(),
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--run-all-compositor-stages-before-draw',
        '--print-to-pdf-no-header',
        `--print-to-pdf=${output}`,
        `file:///${input.replace(/\\/g, '/')}`,
      ],
      { timeout: 30000, windowsHide: true },
    );
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
