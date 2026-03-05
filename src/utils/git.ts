import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

/**
 * Run a git command in the given working directory.
 * Returns stdout on success, throws on failure.
 */
export async function gitExec(cmd: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd });
  return stdout.trim();
}

export async function gitAdd(cwd: string, file: string): Promise<void> {
  await gitExec(`git add ${JSON.stringify(file)}`, cwd);
}

export async function gitCommit(
  cwd: string,
  message: string,
  authorName: string,
  authorEmail: string
): Promise<void> {
  const author = `${authorName} <${authorEmail}>`;
  await gitExec(
    `git commit -m ${JSON.stringify(message)} --author=${JSON.stringify(author)}`,
    cwd
  );
}

export async function gitPush(cwd: string): Promise<void> {
  await gitExec("git push", cwd);
}

/**
 * Clone a GitHub repository to an absolute local path.
 * Creates parent directories if needed.
 */
export async function gitClone(repoUrl: string, localPath: string): Promise<void> {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await execAsync(`git clone ${JSON.stringify(repoUrl)} ${JSON.stringify(localPath)}`);
}

/**
 * Pull latest changes in an existing local git clone.
 */
export async function gitPullRepo(localPath: string): Promise<void> {
  await gitExec("git pull", localPath);
}

export interface GitAuthor {
  name: string;
  email: string;
  date: string;
}

/**
 * Return the last-commit author for a vault file using git log.
 * filePath must be relative to vaultRoot (same as TFile.path).
 * Returns null if the file has no git history yet.
 */
export async function gitGetLastAuthor(
  vaultRoot: string,
  filePath: string
): Promise<GitAuthor | null> {
  const out = await gitExec(
    `git log --follow -1 --format="%an|%ae|%ai" -- ${JSON.stringify(filePath)}`,
    vaultRoot
  );
  if (!out) return null;
  const [name, email, date] = out.split("|");
  if (!name || !email) return null;
  return { name, email, date: date.trim() };
}
