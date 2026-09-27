// Starts the Postgres container only when the database isn't already reachable,
// so machines running a native Postgres (no Docker) can still use `bun run dev`.
const ENV_FILE = "apps/web/.env";
const DATABASE_URL_LINE = /^DATABASE_URL=(?<url>.+)$/mu;
const DEFAULT_POSTGRES_PORT = 5432;

const readDatabaseUrl = async (): Promise<string | undefined> => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const file = Bun.file(ENV_FILE);
  if (!(await file.exists())) {
    return;
  }
  const contents = await file.text();
  return contents.match(DATABASE_URL_LINE)?.groups?.url?.trim();
};

const isReachable = async (
  hostname: string,
  port: number
): Promise<boolean> => {
  try {
    // We only probe the port; the connection closes as soon as it opens.
    const socket = await Bun.connect({
      hostname,
      port,
      socket: { data: (openSocket) => openSocket.end() },
    });
    socket.end();
    return true;
  } catch {
    return false;
  }
};

const databaseUrl = await readDatabaseUrl();
if (databaseUrl) {
  const { hostname, port } = new URL(databaseUrl);
  const dbPort = Number(port) || DEFAULT_POSTGRES_PORT;
  if (await isReachable(hostname, dbPort)) {
    process.stdout.write(
      `Postgres already reachable at ${hostname}:${dbPort}, skipping docker.\n`
    );
    process.exit(0);
  }
}

const docker = Bun.spawnSync(["docker", "compose", "up", "-d", "postgres"], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(docker.exitCode ?? 1);
