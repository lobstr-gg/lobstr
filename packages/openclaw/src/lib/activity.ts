import * as fs from 'fs';
import * as path from 'path';
import { ActivityData } from '../types';

function getActivityPath(workspacePath: string): string {
  return path.join(workspacePath, 'activity.json');
}

export function readActivity(workspacePath: string): ActivityData {
  const actPath = getActivityPath(workspacePath);
  if (!fs.existsSync(actPath)) {
    return { channelCount: 0, toolCallCount: 0, lastUpdated: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(actPath, 'utf-8'));
}

export function writeActivity(workspacePath: string, data: ActivityData): void {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getActivityPath(workspacePath), JSON.stringify(data, null, 2));
}

export function incrementChannels(workspacePath: string, count: number = 1): ActivityData {
  const data = readActivity(workspacePath);
  data.channelCount += count;
  writeActivity(workspacePath, data);
  return data;
}

export function incrementToolCalls(workspacePath: string, count: number = 1): ActivityData {
  const data = readActivity(workspacePath);
  data.toolCallCount += count;
  writeActivity(workspacePath, data);
  return data;
}
