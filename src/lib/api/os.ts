export interface OsCommandResult {
  output: string;
  exitCode: number;
  cwd: string;
}

export async function executeOsCommand(
  roomId: string,
  teamId: string,
  command: string,
  accessToken: string
): Promise<OsCommandResult> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/os/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ roomId, teamId, command }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to execute OS command');
  }

  return response.json();
}
