import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  fetchValhallaRoute,
  toValhallaCosting,
  Waypoint,
} from './routing.service.js';

const executeFile = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface AiTripRequest {
  vehicle?: { mode?: string };
}

const getPythonExecutable = async (): Promise<string> => {
  if (process.env.AI_PYTHON_BIN) return process.env.AI_PYTHON_BIN;
  const virtualEnvironmentPython = path.join(projectRoot, 'ai/.venv/bin/python');
  try {
    await access(virtualEnvironmentPython);
    return virtualEnvironmentPython;
  } catch {
    return process.env.PYTHON || 'python3';
  }
};

export const createAiTripPlan = async (
  request: AiTripRequest,
  waypoints: Waypoint[],
): Promise<{ plan: dict; route: object }> => {
  const mode = request.vehicle?.mode;
  const costing = mode ? toValhallaCosting(mode) : undefined;
  if (!mode || !costing) throw new Error('unsupported_trip_mode');

  const routeResult = await fetchValhallaRoute(waypoints, costing);
  if (!routeResult.plannerRoute) throw new Error('planner_route_metadata_unavailable');

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'anantyatra-ai-plan-'));
  const requestPath = path.join(temporaryDirectory, 'request.json');
  const routePath = path.join(temporaryDirectory, 'route.json');
  const outputPath = path.join(temporaryDirectory, 'plan.json');
  const plannerPath = path.join(projectRoot, 'ai/planner/cli.py');
  const poiPath = process.env.AI_POI_DATA_PATH
    || path.join(projectRoot, 'ai/data/processed/karnataka-2026-10-17/pois.jsonl');
  const sourcePath = process.env.AI_SOURCE_REGISTER_PATH
    || path.join(projectRoot, 'ai/data/source-register.jsonl');

  try {
    await Promise.all([
      writeFile(requestPath, JSON.stringify(request), 'utf-8'),
      writeFile(routePath, JSON.stringify(routeResult.plannerRoute), 'utf-8'),
    ]);
    await executeFile(
      await getPythonExecutable(),
      [
        plannerPath,
        '--request', requestPath,
        '--route', routePath,
        '--pois', poiPath,
        '--sources', sourcePath,
        '--validate-route-legs',
        '--output', outputPath,
      ],
      {
        cwd: projectRoot,
        env: process.env,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return {
      plan: JSON.parse(await readFile(outputPath, 'utf-8')) as dict,
      route: routeResult.plannerRoute,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

type dict = Record<string, unknown>;
