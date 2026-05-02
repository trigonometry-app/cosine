<script lang="ts">
  import { Button, easeEmphasized } from 'm3-svelte';
  import { slide } from 'svelte/transition';

  let {
    bottomRight = false,
    modelsDisplayed,
    thinking = $bindable(),
    choosingSince = $bindable(),
    selectModel,
  }: {
    bottomRight?: boolean;
    modelsDisplayed: Array<{ name: string; pareto: boolean; cost: number; elo: number }>;
    thinking: 'only' | 'exclude' | undefined;
    choosingSince: number | undefined;
    selectModel: (name: string) => void;
  } = $props();

  let showAll = $state(false);
</script>

<svelte:window
  onpointerup={(e) => {
    const delayIfSmall = (action: () => void) => {
      if (innerWidth < 40 * 16) {
        setTimeout(action, 10);
      } else {
        action();
      }
    };
    const target = e.target as HTMLElement;
    if (choosingSince && Date.now() - choosingSince > 333) {
      const label = target.closest('label');
      if (label?.classList.contains('m3-container')) return;
      const button = target.closest('button');
      const newModel = button?.dataset.model;
      if (newModel) {
        selectModel(newModel);
      }

      delayIfSmall(() => (choosingSince = undefined));
    }
  }}
/>
<div
  class="popup popup-filters"
  class:bottomRight
  transition:slide={{ duration: 500, easing: easeEmphasized }}
>
  <Button square label><input type="checkbox" bind:checked={showAll} />Show all</Button>
  <div class="gap"></div>
  <Button square label><input type="radio" value="only" bind:group={thinking} />Thinking</Button>
  <Button square label><input type="radio" value="exclude" bind:group={thinking} />Direct</Button>
</div>
<div
  class="popup popup-models"
  class:bottomRight
  transition:slide={{ duration: 500, easing: easeEmphasized }}
>
  {#each modelsDisplayed as { name, pareto, cost, elo } (name)}
    {@const isThinking = name.endsWith(' Thinking')}
    {@const baseName = isThinking ? name.slice(0, -9) : name}
    {@const hidden = !showAll && !pareto}
    {#if !hidden}
      <button
        class="model m3-layer"
        class:non-pareto={!pareto}
        data-model={name}
        style:--score="{Math.min(100, Math.max(0, (elo - 1327) / 2))}%"
      >
        <span>
          {baseName}
          {#if isThinking}
            <span style:opacity="0.5">Thinking</span>
          {/if}
        </span>
        {#if cost > 0}
          <span class="cost-badge">{cost}×</span>
        {/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .popup {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    z-index: 1;
  }
  .popup-filters {
    > input {
      position: absolute;
      pointer-events: none;
      opacity: 0;
    }
    > .gap {
      height: 2rem;
    }
    &.bottomRight {
      flex-direction: column-reverse;
      position: fixed;
      bottom: 0.5rem;
      right: 16rem;
    }
  }
  .popup-models {
    width: 15rem;
    overflow: auto;
    &.bottomRight {
      flex-direction: column-reverse;
      position: fixed;
      bottom: 0.5rem;
      right: 0.5rem;
      max-height: calc(100dvh - 1rem);
    }
  }
  .model {
    display: flex;
    align-items: center;
    text-align: start;
    min-height: 3rem;
    padding-inline: 0.5rem;
    border-radius: 0.5rem;

    overflow: hidden;

    background-color: color-mix(
      in oklab,
      var(--m3c-secondary-container) var(--score),
      var(--m3c-surface-container-low)
    );
    color: color-mix(
      in oklab,
      var(--m3c-on-secondary-container) var(--score),
      var(--m3c-on-surface-variant)
    );
    transition:
      background-color var(--m3-easing-slow),
      color var(--m3-easing-slow);

    &.non-pareto {
      opacity: 0.5;
      min-height: 2rem;
    }

    .cost-badge {
      display: flex;
      min-width: 1.5rem;
      height: 1.5rem;
      padding-inline: 0.25rem;
      align-items: center;
      justify-content: center;
      margin-left: auto;
      @apply --m3-label-small;
      opacity: 0.7;
    }
  }
</style>
