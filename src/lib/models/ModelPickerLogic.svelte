<script lang="ts">
  import { getStorage } from 'monoidentity';
  import type { Options, OptionsBase, Stack, StackItem } from '../types';
  import type { Provider } from '../generate/providers';
  import type { BrokieModels, BrokieProvider } from './types';
  import { type Snippet } from 'svelte';

  type Specs = { speed: number; cost: number; groupName: string; effort?: string };
  type Conn = StackItem & {
    name: string;
    context: number;
    vision: boolean;
    stackScore: number;
    specs: Specs;
  };

  type FilteredIndex = {
    connByName: Record<string, Conn>;
    modelGroups: Record<string, Conn[]>;
    modelStacks: Record<string, Conn[]>;
    reasoningEffortsByGroup: Record<string, string[]>;
  };

  type EloPair = { direct?: number; thinking?: number };

  const REASONING_EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh'];
  const compareReasoningEfforts = (a: string, b: string) => {
    const ia = REASONING_EFFORT_ORDER.indexOf(a);
    const ib = REASONING_EFFORT_ORDER.indexOf(b);
    if (ia != -1 && ib != -1) return ia - ib;
    if (ia != -1) return -1;
    if (ib != -1) return 1;
    return a.localeCompare(b);
  };

  type ChildrenProps = {
    model: string;
    modelsDisplayed: Array<{ name: string; visualScore: number; cost: number }>;
    eloWeight: number;
    thinking: 'only' | 'exclude' | undefined;
    setWeight: (w: number) => void;
    setThinking: (t: 'only' | 'exclude' | undefined) => void;
    selectModel: (name: string) => void;
    currentReasoningEffort: string | undefined;
    availableReasoningEfforts: string[] | undefined;
    setReasoningEffort: (effort: string) => void;
    selectedModelGroupName: string;
  };

  let {
    stack = $bindable(),
    model = $bindable(),
    minContext,
    useImageInput,
    eloWeight = 0.6,
    children,
  }: {
    stack: Stack;
    model: string;
    minContext: number;
    useImageInput: boolean | undefined;
    eloWeight?: number;
    children: Snippet<[ChildrenProps]>;
  } = $props();

  const cache = getStorage('cache');
  const config = getStorage('config');

  let thinking: 'only' | 'exclude' | undefined = $state();

  const setWeight = (newWeight: number) => {
    eloWeight = newWeight;
  };

  const setThinking = (newThinking: 'only' | 'exclude' | undefined) => {
    thinking = newThinking;
  };

  const selectModel = (name: string) => {
    if (modelStacks[name]) {
      model = name;
      return;
    }

    const variants = modelGroups[name];
    if (variants?.length) {
      model =
        variants.find((variant) => variant.specs.effort == 'medium')?.name ?? variants[0].name;
      return;
    }

    model = name;
  };

  const setReasoningEffort = (effort: string) => {
    const currentConn = connByName[model];
    if (!currentConn) return;
    const groupName = currentConn.specs.groupName;
    const candidate = modelGroups[groupName]?.find((c) => c.specs.effort == effort);
    if (candidate) {
      selectModel(candidate.name);
    }
  };

  $effect(() => {
    let computedStack = modelStacks[model];
    if (!computedStack) {
      if (modelsDisplayed.length) {
        model = modelsDisplayed[0].name;
        computedStack = modelStacks[model];
      }
    }
    if (!computedStack) {
      console.warn('Model', model, 'not found');
      return;
    }
    stack = computedStack;
  });

  // Set to a provider key to only enable that provider for testing
  const DEBUG_PROVIDER: Provider | null = null;

  const BROKIE_URL =
    'https://raw.githubusercontent.com/trigonometry-app/brokierouter/refs/heads/main/models.json';
  const CACHE_KEY = 'models/brokierouter';
  const DEFAULT_ELO = 1200;

  const resolveProvider = (
    brokieProvider: BrokieProvider,
  ): { provider: Provider; options: OptionsBase; cost: number } | null => {
    const { id, model_id, cost_multiplier, extra } = brokieProvider;
    const useResponses = extra?.supported_endpoints?.includes('/responses');

    // OpenRouter Free
    if (id.startsWith('openrouter-free/')) {
      const restriction = id.slice('openrouter-free/'.length);
      return {
        provider: 'OpenRouter Free via Cosine',
        options: { model: model_id, providerRestriction: restriction },
        cost: 0,
      };
    }

    // Hack Club (OpenRouter proxy)
    if (id.startsWith('hack-club/')) {
      const restriction = id.slice('hack-club/'.length);
      return {
        provider: 'Hack Club via Cosine',
        options: { model: model_id, providerRestriction: restriction },
        cost: 0,
      };
    }

    // Groq Free
    if (id === 'groq-free') {
      return {
        provider: 'Groq via Cosine',
        options: { model: model_id },
        cost: 0,
      };
    }

    // Cerebras Free
    if (id === 'cerebras-free') {
      return {
        provider: 'Cerebras via Cosine',
        options: { model: model_id },
        cost: 0,
      };
    }

    // Google Free
    if (id === 'google-free') {
      return {
        provider: 'Gemini via Cosine',
        options: { model: model_id },
        cost: 0,
      };
    }

    // GitHub Copilot
    if (id === 'github-copilot') {
      if (!extra?.model_picker_enabled) return null;
      return {
        provider: 'GitHub Copilot',
        options: { model: model_id, useResponses },
        cost: cost_multiplier ?? 0,
      };
    }

    // GitHub Models
    if (id === 'github-models') {
      return {
        provider: 'GitHub Models',
        options: { model: model_id },
        cost: 0,
      };
    }

    // CrofAI
    if (id === 'crofai' || id.startsWith('crofai/')) {
      return {
        provider: 'CrofAI via Cosine',
        options: { model: model_id },
        cost: 0,
      };
    }

    return null;
  };

  let brokieModels: BrokieModels = $state(cache[CACHE_KEY] || []);

  const updateModels = async () => {
    try {
      const r = await fetch(BROKIE_URL);
      if (!r.ok) throw new Error(`${r.status}`);
      const data: BrokieModels = await r.json();
      brokieModels = data;
      cache[CACHE_KEY] = data;
    } catch (e) {
      console.error('Failed to fetch models:', e);
    }
  };
  updateModels();

  let allConns = $derived.by(() => {
    const output: Conn[] = [];
    for (const model of brokieModels) {
      const { name: modelName, providers: modelProviders } = model;

      for (const bp of modelProviders) {
        const resolved = resolveProvider(bp);
        if (!resolved) continue;
        if (DEBUG_PROVIDER && resolved.provider !== DEBUG_PROVIDER) continue;

        const { provider, options, cost } = resolved;
        const context = bp.context_length;
        const speed = bp.tps ?? 40;
        const vision = bp.input_modalities.includes('image');

        // Gate GitHub providers on auth
        if (provider === 'GitHub Copilot' && !config.providers?.ghc) continue;

        const reasoningEfforts = bp.reasoning_efforts;

        if (!bp.output_modalities.includes('text')) continue;

        const nonThinkingEfforts = reasoningEfforts.filter(
          (e) => e == null || e === 'none' || e === 'minimal',
        );
        const thinkingEfforts = reasoningEfforts.filter(
          (e) => e != null && e !== 'none' && e !== 'minimal',
        );
        const createConn = (name: string, optionsWithEffort: Options, effort?: string): Conn => {
          const groupName = name.split('::')[0];
          const adjustedSpeed = speed * (groupName.includes(' Thinking') ? 0.7 : 1);
          return {
            provider,
            name,
            options: optionsWithEffort,
            context,
            vision,
            stackScore: Math.log10(adjustedSpeed) - cost,
            specs: {
              speed: adjustedSpeed,
              cost,
              groupName,
              effort,
            },
          };
        };

        if (nonThinkingEfforts.length > 0) {
          const effort = nonThinkingEfforts[0];
          output.push(createConn(modelName, { ...options, reasoningEffort: effort }, effort));
        }

        for (const effort of thinkingEfforts) {
          const variantName =
            thinkingEfforts.length === 1
              ? `${modelName} Thinking`
              : `${modelName} Thinking::${effort}`;
          output.push(createConn(variantName, { ...options, reasoningEffort: effort }, effort));
        }
      }
    }

    return output;
  });

  let baseIndex = $derived.by(() => {
    const modelNames: string[] = [];
    const modelStacks: Record<string, Conn[]> = {};

    for (const conn of allConns) {
      const stack = modelStacks[conn.name];
      if (stack) {
        stack.push(conn);
      } else {
        modelNames.push(conn.name);
        modelStacks[conn.name] = [conn];
      }
    }

    for (const name of modelNames) {
      modelStacks[name].sort((a, b) => b.stackScore - a.stackScore);
    }

    return { modelNames, modelStacks };
  });

  let allGroupNames = $derived.by(() => {
    const groupNames = new Set<string>();
    for (const conn of allConns) {
      groupNames.add(conn.specs.groupName);
    }
    return [...groupNames];
  });

  let filteredIndex = $derived.by((): FilteredIndex => {
    const connByName: Record<string, Conn> = {};
    const modelGroups: Record<string, Conn[]> = {};
    const modelStacks: Record<string, Conn[]> = {};
    const reasoningEffortsByGroup: Record<string, string[]> = {};

    for (const name of baseIndex.modelNames) {
      const filteredStack = baseIndex.modelStacks[name].filter((conn) => {
        if (conn.context < minContext) return false;
        if (useImageInput == true && !conn.vision) return false;
        if (useImageInput == false && conn.vision && conn.name.startsWith('Llama 3.2'))
          return false;
        return true;
      });
      if (!filteredStack.length) continue;

      modelStacks[name] = filteredStack;
      connByName[name] = filteredStack[0];

      const representative = filteredStack[0];
      (modelGroups[representative.specs.groupName] ||= []).push(representative);

      if (representative.specs.effort) {
        (reasoningEffortsByGroup[representative.specs.groupName] ||= []).push(
          representative.specs.effort,
        );
      }
    }

    for (const groupName of Object.keys(reasoningEffortsByGroup)) {
      reasoningEffortsByGroup[groupName] = Array.from(
        new Set(reasoningEffortsByGroup[groupName]),
      ).sort(compareReasoningEfforts);
    }

    return { connByName, modelGroups, modelStacks, reasoningEffortsByGroup };
  });

  let eloLookup = $derived.by(() => {
    const lookup: Record<string, EloPair> = {};
    for (const { name, elo_direct, elo_thinking } of brokieModels) {
      lookup[name] = { direct: elo_direct, thinking: elo_thinking };
    }
    return lookup;
  });

  let eloResolution = $derived.by(() => {
    const resolved: Record<string, number> = {};
    const warnings: string[] = [];
    for (const groupName of allGroupNames) {
      const isThinking = groupName.endsWith(' Thinking');
      const baseGroupName = isThinking ? groupName.slice(0, -' Thinking'.length) : groupName;
      const { direct, thinking } = eloLookup[baseGroupName] ?? {};

      if (isThinking) {
        resolved[groupName] = thinking ?? direct ?? DEFAULT_ELO;
        if (thinking == null) {
          warnings.push(
            direct != null
              ? `Using direct elo for ${groupName}`
              : `Using default elo for ${groupName}`,
          );
        }
      } else {
        resolved[groupName] = direct ?? (thinking != null ? thinking - 20 : DEFAULT_ELO);
        if (direct == null) {
          warnings.push(
            thinking != null
              ? `Using thinking elo - 20 for ${groupName}`
              : `Using default elo for ${groupName}`,
          );
        }
      }
    }
    return { resolved, warnings };
  });
  let resolvedEloByGroup = $derived(eloResolution.resolved);
  let eloWarnings = $derived(eloResolution.warnings);

  $effect(() => {
    for (const warning of eloWarnings) {
      console.warn(warning);
    }
  });

  let maxKnownElo = $derived(
    Math.max(
      ...Object.values(eloLookup)
        .flatMap((e) => [e.direct, e.thinking])
        .filter((v): v is number => v != null),
      DEFAULT_ELO,
    ),
  );
  let connByName = $derived(filteredIndex.connByName);
  let modelGroups = $derived(filteredIndex.modelGroups);
  let modelStacks = $derived(filteredIndex.modelStacks);
  let reasoningEffortsByGroup = $derived(filteredIndex.reasoningEffortsByGroup);

  let modelsDisplayed = $derived.by(() => {
    const groupNames = Object.keys(modelGroups);

    const modelEntries = groupNames
      .filter((name) => {
        if (thinking == 'only') {
          return name.includes(' Thinking');
        }
        if (thinking == 'exclude') {
          return !name.includes(' Thinking');
        }
        return true;
      })
      .map((groupName) => {
        const variants = modelGroups[groupName] || [];
        const activeVariant = variants.find((v) => v.name == model) || variants[0];
        const stack = modelStacks[activeVariant.name];

        const speed = Math.log(stack[0].specs.speed);
        const elo = resolvedEloByGroup[groupName] ?? DEFAULT_ELO;
        const cost = stack[0].specs.cost;
        return [groupName, { speed, elo, cost }] as const;
      });

    const minElo = 1200;
    const eloRange = maxKnownElo - minElo;
    const minSpeed = Math.log(20);
    const maxSpeed = Math.log(2500);
    const speedRange = maxSpeed - minSpeed;
    let modelEntriesScored = modelEntries
      .map(([name, m]) => {
        const normElo = eloRange ? (m.elo - minElo) / eloRange : 0.5;
        const normSpeed = speedRange ? (m.speed - minSpeed) / speedRange : 0.5;
        const score = eloWeight * normElo + (1 - eloWeight) * normSpeed;
        const visualScore = score;
        return { name, score, visualScore, cost: m.cost };
      })
      .sort((a, b) => b.score - a.score);

    const minScore = Math.min(...modelEntriesScored.map((m) => m.visualScore).filter((m) => m));
    const maxScore = Math.max(...modelEntriesScored.map((m) => m.visualScore).filter((m) => m));
    const scoreRange = maxScore - minScore;
    return modelEntriesScored.map((m) => ({
      name: m.name,
      visualScore: m.visualScore && scoreRange ? (m.visualScore - minScore) / scoreRange : 0,
      cost: m.cost,
    }));
  });

  let conn = $derived(connByName[model]);
  let selectedModelGroupName = $derived(conn?.specs.groupName || model);
  let currentReasoningEffort = $derived(conn?.specs.effort);
  let availableReasoningEfforts = $derived(
    conn ? reasoningEffortsByGroup[conn.specs.groupName] : undefined,
  );
</script>

{@render children({
  model,
  modelsDisplayed,
  eloWeight,
  thinking,
  setWeight,
  setThinking,
  selectModel,
  currentReasoningEffort,
  availableReasoningEfforts,
  setReasoningEffort,
  selectedModelGroupName,
})}
