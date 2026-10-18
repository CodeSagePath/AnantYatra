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
  const plannerEnvironmentPython = path.join(projectRoot, 'ai/data-tools/.venv/bin/python');
  try {
    await access(plannerEnvironmentPython);
    return plannerEnvironmentPython;
  } catch {
    return process.env.PYTHON || 'python3';
  }
};

const getModelPythonExecutable = async (): Promise<string> => {
  if (process.env.AI_MODEL_PYTHON_BIN) return process.env.AI_MODEL_PYTHON_BIN;
  const modelEnvironmentPython = path.join(projectRoot, 'ai/.venv/bin/python');
  try {
    await access(modelEnvironmentPython);
    return modelEnvironmentPython;
  } catch {
    throw new Error('model_environment_missing');
  }
};

export const createAiTripPlan = async (
  request: AiTripRequest,
  waypoints: Waypoint[],
): Promise<{ plan: dict; route: object; places: Record<string, string> }> => {
  const mode = request.vehicle?.mode;
  const costing = mode ? toValhallaCosting(mode) : undefined;
  if (!mode || !costing) throw new Error('unsupported_trip_mode');

  const routeResult = await fetchValhallaRoute(waypoints, costing);
  if (!routeResult.plannerRoute) throw new Error('planner_route_metadata_unavailable');

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'anantyatra-ai-plan-'));
  const requestPath = path.join(temporaryDirectory, 'request.json');
  const routePath = path.join(temporaryDirectory, 'route.json');
  const modelPlanPath = path.join(temporaryDirectory, 'model-plan.json');
  const outputPath = path.join(temporaryDirectory, 'validated-plan.json');
  const modelPlannerPath = path.join(projectRoot, 'ai/planner/model_cli.py');
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
    const modelArguments = [
      modelPlannerPath,
      '--request', requestPath,
      '--route', routePath,
      '--pois', poiPath,
      '--sources', sourcePath,
      '--output', modelPlanPath,
    ];
    if (process.env.AI_MODEL_ID) modelArguments.push('--model', process.env.AI_MODEL_ID);
    if (process.env.AI_MODEL_REVISION) modelArguments.push('--revision', process.env.AI_MODEL_REVISION);
    if (process.env.AI_MODEL_ADAPTER) modelArguments.push('--adapter', process.env.AI_MODEL_ADAPTER);

    await executeFile(
      await getModelPythonExecutable(),
      modelArguments,
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          HF_HOME: process.env.HF_HOME || path.join(projectRoot, 'ai/model-cache'),
        },
        timeout: 300_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    await executeFile(
      await getPythonExecutable(),
      [
        plannerPath,
        '--request', requestPath,
        '--route', routePath,
        '--pois', poiPath,
        '--sources', sourcePath,
        '--model-plan', modelPlanPath,
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
    const plan = JSON.parse(await readFile(outputPath, 'utf-8')) as dict;
    const places = await resolveSelectedPlaceNames(poiPath, plan);
    return {
      plan,
      route: routeResult.plannerRoute,
      places,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

const resolveSelectedPlaceNames = async (poiPath: string, plan: dict): Promise<Record<string, string>> => {
  const days = Array.isArray(plan.days) ? plan.days : [];
  const selectedIds = new Set(
    days.flatMap((day) => {
      if (!day || typeof day !== 'object' || !Array.isArray((day as dict).stops)) return [];
      return ((day as dict).stops as dict[])
        .map((stop) => stop.poiId)
        .filter((poiId): poiId is string => typeof poiId === 'string');
    }),
  );
  if (selectedIds.size === 0) return {};

  const records = (await readFile(poiPath, 'utf-8')).split('\n');
  const places: Record<string, string> = {};
  for (const line of records) {
    if (!line.trim()) continue;
    const poi = JSON.parse(line) as { poiId?: string; displayName?: string };
    if (poi.poiId && selectedIds.has(poi.poiId) && poi.displayName) {
      places[poi.poiId] = poi.displayName;
    }
  }
  return places;
};

type dict = Record<string, unknown>;
